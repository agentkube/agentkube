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
	"github.com/anchore/grype/grype/db/v6/distribution"
	"github.com/anchore/grype/grype/db/v6/installation"
	"github.com/anchore/grype/grype/distro"
	"github.com/anchore/grype/grype/match"
	"github.com/anchore/grype/grype/matcher"
	"github.com/anchore/grype/grype/pkg"
	"github.com/anchore/grype/grype/vulnerability"
	"github.com/anchore/syft/syft"
	"github.com/anchore/syft/syft/cataloging/pkgcataloging"
	"github.com/anchore/syft/syft/source"
)

const (
	imgScanTimeout = 5 * time.Minute
)

var ImgScanner *imageScanner

type ImageScans struct {
	Enable     bool       `json:"enable"`
	Exclusions Exclusions `json:"exclusions"`
}

type Exclusions struct {
	Namespaces []string            `json:"namespaces"`
	Labels     map[string][]string `json:"labels"`
}

type imageScanner struct {
	mx           sync.RWMutex
	scans        Scans
	config       ImageScans
	log          *slog.Logger
	opts         *options.Grype
	vulnProvider vulnerability.Provider
	initialized  bool
}

type Scans map[string]*Scan

type Scan struct {
	ID    string
	Table *table
	Tally tally
}

type table struct {
	Rows []row
}

type row []string

type tally struct {
	Critical int
	High     int
	Medium   int
	Low      int
	Unknown  int
	Total    int
}

func NewImageScanner(cfg ImageScans, l *slog.Logger) *imageScanner {
	return &imageScanner{
		scans:  make(Scans),
		config: cfg,
		log:    l.With("subsys", "vul"),
	}
}

func (s *imageScanner) Init(name, version string) {
	s.mx.Lock()
	defer s.mx.Unlock()

	id := clio.Identification{Name: name, Version: version}
	s.opts = options.DefaultGrype(id)
	s.opts.GenerateMissingCPEs = true

	// Load vulnerability database with proper configuration
	distConfig := distribution.Config{
		// Use default update URL if none specified
	}

	instConfig := installation.Config{
		DBRootDir:        s.opts.DB.Dir, // Use the configured DB directory
		ValidateChecksum: s.opts.DB.ValidateByHashOnStart,
		ValidateAge:      s.opts.DB.ValidateAge,
	}

	var err error
	s.vulnProvider, _, err = grype.LoadVulnerabilityDB(
		distConfig,
		instConfig,
		s.opts.DB.AutoUpdate,
	)
	if err != nil {
		s.log.Error("VulDb load failed", "error", err)
		return
	}

	s.initialized = true
	s.log.Info("Vulnerability scanner initialized")
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

func (s *imageScanner) scanWorker(ctx context.Context, img string) {
	defer s.log.Debug("ScanWorker bailing out!")

	s.log.Debug("ScanWorker processing image", "image", img)
	sc := newScan(img)
	s.setScan(img, sc)
	if err := s.scan(ctx, img, sc); err != nil {
		s.log.Warn("Scan failed for image",
			"image", img,
			"error", err,
		)
	}
}

func (s *imageScanner) scan(ctx context.Context, img string, sc *Scan) error {
	var errs error

	// Create source from image
	src, err := syft.GetSource(ctx, img, syft.DefaultGetSourceConfig())
	if err != nil {
		errs = errors.Join(errs, fmt.Errorf("failed to get source for %s: %w", img, err))
		return errs
	}

	// Create SBOM
	config := syft.DefaultCreateSBOMConfig().WithCatalogerSelection(
		pkgcataloging.NewSelectionRequest().WithDefaults("all"),
	)
	config.Search.Scope = source.SquashedScope
	sbomResult, err := syft.CreateSBOM(ctx, src, config)
	if err != nil {
		errs = errors.Join(errs, fmt.Errorf("failed to create SBOM for %s: %w", img, err))
		return errs
	}

	// Convert packages for Grype
	packages := pkg.FromCollection(sbomResult.Artifacts.Packages, pkg.SynthesisConfig{
		Distro: pkg.DistroConfig{
			Override: distro.FromRelease(sbomResult.Artifacts.LinuxDistribution, distro.DefaultFixChannels()),
		},
	})

	// Initialize matchers
	matchers := matcher.NewDefaultMatchers(matcher.Config{})

	// Find vulnerabilities using the correct API
	mm := grype.FindVulnerabilitiesForPackage(s.vulnProvider, matchers, packages)

	if err := sc.run(&mm, s.vulnProvider); err != nil {
		errs = errors.Join(errs, err)
	}

	return errs
}

func newScan(id string) *Scan {
	return &Scan{
		ID:    id,
		Table: &table{Rows: make([]row, 0)},
		Tally: tally{},
	}
}

func (s *Scan) run(mm *match.Matches, store vulnerability.MetadataProvider) error {
	for m := range mm.Enumerate() {
		meta, err := store.VulnerabilityMetadata(vulnerability.Reference{ID: m.Vulnerability.ID, Namespace: m.Vulnerability.Namespace})
		if err != nil {
			return err
		}
		var severity string
		if meta != nil {
			severity = meta.Severity
		}
		fixVersion := "N/A"
		if len(m.Vulnerability.Fix.Versions) > 0 {
			fixVersion = strings.Join(m.Vulnerability.Fix.Versions, ", ")
		}
		switch m.Vulnerability.Fix.State {
		case "wont-fix":
			fixVersion = "Won't Fix"
		case "unknown":
			fixVersion = "N/A"
		}
		s.Table.addRow(newRow(m.Package.Name, m.Package.Version, fixVersion, string(m.Package.Type), m.Vulnerability.ID, severity))
	}
	s.Table.dedup()
	s.Tally = newTally(s.Table)

	return nil
}

func (t *table) addRow(r row) {
	t.Rows = append(t.Rows, r)
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
