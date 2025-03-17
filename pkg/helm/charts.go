package helm

import (
	"path/filepath"
	"strings"

	"helm.sh/helm/v3/cmd/helm/search"
	"helm.sh/helm/v3/pkg/cli"
	"helm.sh/helm/v3/pkg/helmpath"
	"helm.sh/helm/v3/pkg/repo"
)

type ChartInfo struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Version     string `json:"version"`
	AppVersion  string `json:"appVersion"`
	Repository  string `json:"repository"`
}

// ListCharts returns a list of charts with optional filtering
func ListCharts(filter string, settings *cli.EnvSettings) ([]ChartInfo, error) {
	// Read repo file
	repoFile, err := repo.LoadFile(settings.RepositoryConfig)
	if err != nil {
		return nil, err
	}

	var chartInfos []ChartInfo

	for _, re := range repoFile.Repositories {
		index := search.NewIndex()

		name := re.Name
		repoIndexFile := filepath.Join(settings.RepositoryCache, helmpath.CacheIndexFile(name))

		indexFile, err := repo.LoadIndexFile(repoIndexFile)
		if err != nil {
			return nil, err
		}

		index.AddRepo(name, indexFile, true)

		for _, chart := range index.All() {
			chart := chart
			if filter != "" {
				if strings.Contains(strings.ToLower(chart.Name), strings.ToLower(filter)) {
					chartInfos = append(chartInfos, ChartInfo{
						Name:        chart.Name,
						Description: chart.Chart.Description,
						Version:     chart.Chart.Version,
						AppVersion:  chart.Chart.AppVersion,
						Repository:  name,
					})
				}
			} else {
				chartInfos = append(chartInfos, ChartInfo{
					Name:        chart.Name,
					Description: chart.Chart.Description,
					Version:     chart.Chart.Version,
					AppVersion:  chart.Chart.AppVersion,
					Repository:  name,
				})
			}
		}
	}

	return chartInfos, nil
}
