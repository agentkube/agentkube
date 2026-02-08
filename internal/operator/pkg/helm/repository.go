package helm

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/agentkube/operator/pkg/logger"
	"github.com/gofrs/flock"
	"helm.sh/helm/v3/pkg/cli"
	"helm.sh/helm/v3/pkg/getter"
	"helm.sh/helm/v3/pkg/repo"
)

const (
	defaultNewConfigFileMode   os.FileMode = os.FileMode(0o644)
	defaultNewConfigFolderMode os.FileMode = os.FileMode(0o770)
	timeoutForLock                         = 30 * time.Second
)

type RepositoryInfo struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

type AddUpdateRepoRequest struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

// createFileIfNotThere creates a file if it doesn't exist, including any missing directories
func createFileIfNotThere(fileName string) error {
	_, err := os.Stat(fileName)
	if os.IsNotExist(err) {
		// create changes
		_, err = createFullPath(fileName)
		return err
	}

	return nil
}

// createFullPath creates a full path, including directories if it does not exist
func createFullPath(p string) (*os.File, error) {
	if err := os.MkdirAll(filepath.Dir(p), defaultNewConfigFolderMode); err != nil {
		return nil, err
	}

	return os.Create(p)
}

// lockRepositoryFile uses a file lock like the helm tool
func lockRepositoryFile(lockCtx context.Context, repositoryConfig string) (bool, *flock.Flock, error) {
	var lockPath string

	repoFileExt := filepath.Ext(repositoryConfig)

	if len(repoFileExt) > 0 && len(repoFileExt) < len(repositoryConfig) {
		lockPath = strings.Replace(repositoryConfig, repoFileExt, ".lock", 1)
	} else {
		lockPath = repositoryConfig + ".lock"
	}

	fileLock := flock.New(lockPath)

	locked, err := fileLock.TryLockContext(lockCtx, time.Second)

	return locked, fileLock, err
}

// AddRepository adds a repository with name, url to the helm config
func AddRepository(name string, url string, settings *cli.EnvSettings) error {
	err := createFileIfNotThere(settings.RepositoryConfig)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "creating empty RepositoryConfig file")
		return err
	}

	lockCtx, cancel := context.WithTimeout(context.Background(), timeoutForLock)
	defer cancel()

	locked, fileLock, err := lockRepositoryFile(lockCtx, settings.RepositoryConfig)
	if err == nil && locked {
		defer func() {
			err := fileLock.Unlock()
			if err != nil {
				logger.Log(logger.LevelError, nil, err, "unlocking repository config file")
			}
		}()
	}

	if err != nil {
		logger.Log(logger.LevelError, nil, err, "locking repository config file")
		return err
	}

	// read repo file
	repoFile, err := repo.LoadFile(settings.RepositoryConfig)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "reading repo file")
		return err
	}

	// add repo
	newRepo := &repo.Entry{
		Name: name,
		URL:  url,
	}

	repoObj, err := repo.NewChartRepository(newRepo, getter.All(settings))
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "creating chart repository")
		return err
	}

	// download chart repo index
	_, err = repoObj.DownloadIndexFile()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "downloading index file")
		return err
	}

	// write repo file
	repoFile.Update(newRepo)

	err = repoFile.WriteFile(settings.RepositoryConfig, defaultNewConfigFileMode)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "writing repo file")
		return err
	}

	return nil
}

// ListRepositories lists all repositories
func ListRepositories(settings *cli.EnvSettings) ([]RepositoryInfo, error) {
	err := createFileIfNotThere(settings.RepositoryConfig)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "creating empty RepositoryConfig file")
		return nil, err
	}

	// read repo file
	repoFile, err := repo.LoadFile(settings.RepositoryConfig)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "reading repo file")
		return nil, err
	}

	// response
	repositories := make([]RepositoryInfo, 0, len(repoFile.Repositories))

	for _, repo := range repoFile.Repositories {
		repo := repo

		repositories = append(repositories, RepositoryInfo{
			Name: repo.Name,
			URL:  repo.URL,
		})
	}

	return repositories, nil
}

// RemoveRepository removes a repository by name
func RemoveRepository(name string, settings *cli.EnvSettings) error {
	err := createFileIfNotThere(settings.RepositoryConfig)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "creating empty RepositoryConfig file")
		return err
	}

	lockCtx, cancel := context.WithTimeout(context.Background(), timeoutForLock)
	defer cancel()

	locked, fileLock, err := lockRepositoryFile(lockCtx, settings.RepositoryConfig)
	if err == nil && locked {
		defer func() {
			err := fileLock.Unlock()
			if err != nil {
				logger.Log(logger.LevelError, nil, err, "unlocking repository config file")
			}
		}()
	}

	repoFile, err := repo.LoadFile(settings.RepositoryConfig)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "reading repo file")
		return err
	}

	isRemoved := repoFile.Remove(name)
	if !isRemoved {
		logger.Log(logger.LevelError, nil, nil, "repository not found")
		return nil // Not an error, just no-op
	}

	// write repo file
	err = repoFile.WriteFile(settings.RepositoryConfig, defaultNewConfigFileMode)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "writing repo file")
		return err
	}

	return nil
}

// UpdateRepository updates a repository with new URL
func UpdateRepository(name, url string, settings *cli.EnvSettings) error {
	err := createFileIfNotThere(settings.RepositoryConfig)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "creating empty RepositoryConfig file")
		return err
	}

	lockCtx, cancel := context.WithTimeout(context.Background(), timeoutForLock)
	defer cancel()

	locked, fileLock, err := lockRepositoryFile(lockCtx, settings.RepositoryConfig)
	if err == nil && locked {
		defer func() {
			err := fileLock.Unlock()
			if err != nil {
				logger.Log(logger.LevelError, nil, err, "unlocking repository config file")
			}
		}()
	}

	repoFile, err := repo.LoadFile(settings.RepositoryConfig)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "reading repo file")
		return err
	}

	// update repo
	repoFile.Update(&repo.Entry{
		Name: name,
		URL:  url,
	})

	err = repoFile.WriteFile(settings.RepositoryConfig, defaultNewConfigFileMode)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "writing repo file")
		return err
	}

	return nil
}
