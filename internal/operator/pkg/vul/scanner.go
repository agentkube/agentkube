package vul

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/anchore/clio"
	"github.com/anchore/grype/cmd/grype/cli/options"
	"github.com/anchore/grype/grype"
	v6dist "github.com/anchore/grype/grype/db/v6/distribution"
	v6inst "github.com/anchore/grype/grype/db/v6/installation"
	"github.com/anchore/grype/grype/match"
	"github.com/anchore/grype/grype/matcher"
	"github.com/anchore/grype/grype/matcher/dotnet"
	"github.com/anchore/grype/grype/matcher/golang"
	"github.com/anchore/grype/grype/matcher/java"
	"github.com/anchore/grype/grype/matcher/javascript"
	"github.com/anchore/grype/grype/matcher/python"
	"github.com/anchore/grype/grype/matcher/ruby"
	"github.com/anchore/grype/grype/matcher/stock"
	"github.com/anchore/grype/grype/pkg"
	"github.com/anchore/grype/grype/vex"
	"github.com/anchore/grype/grype/vulnerability"
	"github.com/anchore/syft/syft"
	"github.com/anchore/syft/syft/cataloging"
)

const (
	imgScanTimeout = 5 * time.Minute
	wontFix        = "(won't fix)"
	naValue        = "N/A"
)

// Global scanner instance
var ImgScanner *imageScanner

// ImageScans configuration similar to K9s
type ImageScans struct {
	Enable     bool       `json:"enable"`
	Exclusions Exclusions `json:"exclusions"`
}

type Exclusions struct {
	Namespaces []string            `json:"namespaces"`
	Labels     map[string][]string `json:"labels"`
}

// imageScanner follows K9s architecture
type imageScanner struct {
	vulnProvider vulnerability.Provider
	dbStatus     *vulnerability.ProviderStatus
	opts         *options.Grype
	scans        Scans
	mx           sync.RWMutex
	initialized  bool
	config       ImageScans
	log          *slog.Logger
}

type Scans map[string]*Scan

type Scan struct {
	ID    string
	Table *table
	Tally tally
}

type table struct {
	Rows     []row
	Metadata []rowMetadata
}

type row []string

type rowMetadata struct {
	Match        *match.Match
	VulnMetadata *vulnerability.Metadata
}

type tally struct {
	Critical int
	High     int
	Medium   int
	Low      int
	Unknown  int
	Total    int
}

// NewImageScanner creates a new image scanner like K9s
func NewImageScanner(cfg ImageScans, l *slog.Logger) *imageScanner {
	return &imageScanner{
		scans:  make(Scans),
		config: cfg,
		log:    l.With("subsys", "vul"),
	}
}

// Init initializes the scanner exactly like K9s does
func (s *imageScanner) Init(name, version string) {
	s.mx.Lock()
	defer s.mx.Unlock()

	id := clio.Identification{Name: name, Version: version}
	s.opts = options.DefaultGrype(id)
	s.opts.GenerateMissingCPEs = true

	var err error
	s.vulnProvider, s.dbStatus, err = grype.LoadVulnerabilityDB(
		v6dist.Config{
			ID:                 id,
			LatestURL:          s.opts.DB.UpdateURL,
			CACert:             s.opts.DB.CACert,
			RequireUpdateCheck: s.opts.DB.RequireUpdateCheck,
			CheckTimeout:       s.opts.DB.UpdateAvailableTimeout,
			UpdateTimeout:      s.opts.DB.UpdateDownloadTimeout,
		},
		v6inst.Config{
			DBRootDir:               s.opts.DB.Dir,
			ValidateAge:             s.opts.DB.ValidateAge,
			MaxAllowedBuiltAge:      s.opts.DB.MaxAllowedBuiltAge,
			UpdateCheckMaxFrequency: s.opts.DB.MaxUpdateCheckFrequency,
		},
		s.opts.DB.AutoUpdate,
	)
	if err != nil {
		s.log.Error("VulDb load failed", "error", err)
		return
	}

	if e := validateDBLoad(err, s.dbStatus); e != nil {
		s.log.Error("VulDb validate failed", "error", e)
		return
	}

	s.initialized = true
	s.log.Info("Vulnerability scanner initialized successfully")
}

// Stop closes scan database like K9s
func (s *imageScanner) Stop() {
	s.mx.Lock()
	defer s.mx.Unlock()

	if s.vulnProvider != nil {
		s.vulnProvider = nil
	}
}

// validateDBLoad validates database load like K9s
func validateDBLoad(loadErr error, status *vulnerability.ProviderStatus) error {
	if loadErr != nil {
		return fmt.Errorf("failed to load vulnerability db: %w", loadErr)
	}
	if status == nil {
		return fmt.Errorf("unable to determine the status of the vulnerability db")
	}
	if status.Error != nil {
		return fmt.Errorf("db could not be loaded: %w", status.Error)
	}
	return nil
}

func (s *imageScanner) GetScan(img string) (*Scan, bool) {
	s.mx.RLock()
	defer s.mx.RUnlock()
	sc, ok := s.scans[img]
	return sc, ok
}

func (s *imageScanner) setScan(img string, sc *Scan) {
	s.mx.Lock()
	defer s.mx.Unlock()
	s.scans[img] = sc
}

func (s *imageScanner) ShouldExclude(ns string, lbls map[string]string) bool {
	return s.config.ShouldExclude(ns, lbls)
}

func (s *imageScanner) IsEnabled() bool {
	return s.config.Enable
}

func (s *imageScanner) isInitialized() bool {
	s.mx.RLock()
	defer s.mx.RUnlock()
	return s.initialized
}

// Enqueue images for scanning like K9s
func (s *imageScanner) Enqueue(ctx context.Context, images ...string) {
	if !s.isInitialized() {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, imgScanTimeout)
	defer cancel()

	for _, img := range images {
		if _, ok := s.GetScan(img); ok {
			continue
		}
		go s.scanWorker(ctx, img)
	}
}

// scanWorker processes individual image scans like K9s
func (s *imageScanner) scanWorker(ctx context.Context, img string) {
	defer s.log.Debug("ScanWorker bailing out!")

	s.log.Info("ScanWorker processing image", "image", img)
	sc := newScan(img)
	s.setScan(img, sc)
	if err := s.scan(ctx, img, sc); err != nil {
		s.log.Error("Scan failed for image",
			"image", img,
			"error", err,
		)
	} else {
		s.log.Info("Scan completed successfully", "image", img)
	}
}

// scan performs the actual vulnerability scanning like K9s
func (s *imageScanner) scan(_ context.Context, img string, sc *Scan) error {
	defer func(t time.Time) {
		s.log.Debug("[Vulscan] perf",
			"image", img,
			"elapsed", time.Since(t),
		)
	}(time.Now())

	s.log.Info("Starting vulnerability scan", "image", img)

	var errs error
	packages, pkgContext, _, err := pkg.Provide(img, getProviderConfig(s.opts))
	if err != nil {
		s.log.Error("Failed to catalog packages", "image", img, "error", err)
		errs = errors.Join(errs, fmt.Errorf("failed to catalog %s: %w", img, err))
		return errs
	}

	s.log.Info("Cataloged packages", "image", img, "packages", len(packages))

	vexProcessor, err := vex.NewProcessor(vex.ProcessorOptions{
		Documents:   s.opts.VexDocuments,
		IgnoreRules: s.opts.Ignore,
	})
	if err != nil {
		errs = errors.Join(errs, fmt.Errorf("failed to create vex processor: %w", err))
	}

	v := grype.VulnerabilityMatcher{
		VulnerabilityProvider: s.vulnProvider,
		IgnoreRules:           s.opts.Ignore,
		NormalizeByCVE:        s.opts.ByCVE,
		FailSeverity:          s.opts.FailOnSeverity(),
		Matchers:              getMatchers(s.opts),
		VexProcessor:          vexProcessor,
	}

	mm, _, err := v.FindMatches(packages, pkgContext)
	if err != nil {
		s.log.Error("Failed to find vulnerability matches", "image", img, "error", err)
		errs = errors.Join(errs, err)
	}

	s.log.Info("Found vulnerability matches", "image", img, "matches", mm.Count())

	if err := sc.run(mm, s.vulnProvider); err != nil {
		s.log.Error("Failed to process scan results", "image", img, "error", err)
		errs = errors.Join(errs, err)
	}

	s.log.Info("Vulnerability scan completed", "image", img, "vulnerabilities", sc.Tally.Total)

	return errs
}

// getProviderConfig creates provider config like K9s
func getProviderConfig(opts *options.Grype) pkg.ProviderConfig {
	// Create default SBOM configuration like K9s does
	cfg := syft.DefaultCreateSBOMConfig()
	cfg.Packages.JavaArchive.IncludeIndexedArchives = opts.Search.IncludeIndexedArchives
	cfg.Packages.JavaArchive.IncludeUnindexedArchives = opts.Search.IncludeUnindexedArchives

	// Handle packages with missing version information
	cfg.Compliance.MissingVersion = cataloging.ComplianceActionDrop

	return pkg.ProviderConfig{
		SyftProviderConfig: pkg.SyftProviderConfig{
			SBOMOptions:            cfg,
			RegistryOptions:        opts.Registry.ToOptions(),
			Platform:               opts.Platform,
			Name:                   opts.Name,
			DefaultImagePullSource: opts.DefaultImagePullSource,
			Exclusions:             opts.Exclusions,
		},
		SynthesisConfig: pkg.SynthesisConfig{
			GenerateMissingCPEs: opts.GenerateMissingCPEs,
		},
	}
}

// getMatchers creates matchers like K9s
func getMatchers(opts *options.Grype) []match.Matcher {
	return matcher.NewDefaultMatchers(
		matcher.Config{
			Java: java.MatcherConfig{
				ExternalSearchConfig: opts.ExternalSources.ToJavaMatcherConfig(),
				UseCPEs:              opts.Match.Java.UseCPEs,
			},
			Ruby:       ruby.MatcherConfig(opts.Match.Ruby),
			Python:     python.MatcherConfig(opts.Match.Python),
			Dotnet:     dotnet.MatcherConfig(opts.Match.Dotnet),
			Javascript: javascript.MatcherConfig(opts.Match.Javascript),
			Golang: golang.MatcherConfig{
				UseCPEs:               opts.Match.Golang.UseCPEs,
				AlwaysUseCPEForStdlib: opts.Match.Golang.AlwaysUseCPEForStdlib,
			},
			Stock: stock.MatcherConfig(opts.Match.Stock),
		},
	)
}

func newScan(id string) *Scan {
	return &Scan{
		ID: id,
		Table: &table{
			Rows:     make([]row, 0),
			Metadata: make([]rowMetadata, 0),
		},
		Tally: tally{},
	}
}

// run processes scan results like K9s
func (s *Scan) run(mm *match.Matches, vulnProvider vulnerability.Provider) error {
	for m := range mm.Enumerate() {
		meta, err := vulnProvider.VulnerabilityMetadata(vulnerability.Reference{ID: m.Vulnerability.ID, Namespace: m.Vulnerability.Namespace})
		if err != nil {
			return err
		}
		var severity string
		if meta != nil {
			severity = meta.Severity
		}
		fixVersion := strings.Join(m.Vulnerability.Fix.Versions, ", ")
		switch m.Vulnerability.Fix.State {
		case vulnerability.FixStateWontFix:
			fixVersion = wontFix
		case vulnerability.FixStateUnknown:
			fixVersion = naValue
		}

		// Store enhanced row with metadata
		s.Table.addRowWithMetadata(&m, meta, fixVersion, severity)
	}
	s.Table.dedup()
	s.Tally = newTally(s.Table)

	return nil
}

// func (t *table) addRow(r row) {
// 	t.Rows = append(t.Rows, r)
// }

func (t *table) addRowWithMetadata(m *match.Match, meta *vulnerability.Metadata, fixVersion, severity string) {
	r := newRow(m.Package.Name, m.Package.Version, fixVersion, string(m.Package.Type), m.Vulnerability.ID, severity)
	t.Rows = append(t.Rows, r)
	t.Metadata = append(t.Metadata, rowMetadata{
		Match:        m,
		VulnMetadata: meta,
	})
}

func (t *table) dedup() {
	seen := make(map[string]bool)
	var dedupedRows []row
	for _, r := range t.Rows {
		key := fmt.Sprintf("%s|%s|%s|%s|%s", r[0], r[1], r[2], r[3], r[4])
		if !seen[key] {
			seen[key] = true
			dedupedRows = append(dedupedRows, r)
		}
	}
	t.Rows = dedupedRows
}

func newRow(name, version, fix, packageType, vulnID, severity string) row {
	return row{name, version, fix, packageType, vulnID, severity}
}

func newTally(t *table) tally {
	tally := tally{}
	for _, r := range t.Rows {
		severity := r[5] // severity is at index 5
		switch severity {
		case "Critical":
			tally.Critical++
		case "High":
			tally.High++
		case "Medium":
			tally.Medium++
		case "Low":
			tally.Low++
		default:
			tally.Unknown++
		}
		tally.Total++
	}
	return tally
}

func (r row) Name() string {
	if len(r) > 0 {
		return r[0]
	}
	return ""
}

func (r row) Version() string {
	if len(r) > 1 {
		return r[1]
	}
	return ""
}

func (r row) Fix() string {
	if len(r) > 2 {
		return r[2]
	}
	return ""
}

func (r row) Type() string {
	if len(r) > 3 {
		return r[3]
	}
	return ""
}

func (r row) Vulnerability() string {
	if len(r) > 4 {
		return r[4]
	}
	return ""
}

func (r row) Severity() string {
	if len(r) > 5 {
		return r[5]
	}
	return ""
}

func (cfg ImageScans) ShouldExclude(ns string, lbls map[string]string) bool {
	// Check namespace exclusions
	for _, excludeNS := range cfg.Exclusions.Namespaces {
		if ns == excludeNS {
			return true
		}
	}

	// Check label exclusions
	for key, excludeValues := range cfg.Exclusions.Labels {
		if val, exists := lbls[key]; exists {
			for _, excludeVal := range excludeValues {
				if val == excludeVal {
					return true
				}
			}
		}
	}

	return false
}

// ImageInfo represents container image information
type ImageInfo struct {
	Name        string            `json:"name"`
	Namespace   string            `json:"namespace"`
	PodName     string            `json:"podName"`
	Container   string            `json:"container"`
	Labels      map[string]string `json:"labels"`
	Annotations map[string]string `json:"annotations"`
	Image       string            `json:"image"`
	ImageID     string            `json:"imageId"`
}
