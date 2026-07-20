package utils

import (
	"embed"
	"net"
	"os"
	"strings"
	"sync"

	"github.com/oschwald/geoip2-golang"
)

//go:embed geoipdata
var geoFS embed.FS

var (
	geoDB   *geoip2.Reader
	geoOnce sync.Once
	geoErr  error
)

func InitGeoIP() {
	geoOnce.Do(func() {
		path := os.Getenv("GEOIP_DB_PATH")
		if path != "" {
			geoDB, geoErr = geoip2.Open(path)
			if geoErr != nil {
				LogWarn("failed to open GeoIP database", "path", path, "error", geoErr)
			}
			return
		}

		entries, err := geoFS.ReadDir("geoipdata")
		if err != nil || len(entries) == 0 {
			LogWarn("no embedded mmdb file found, GeoIP disabled")
			return
		}

		var mmdbFile string
		for _, e := range entries {
			if !e.IsDir() && strings.HasSuffix(e.Name(), ".mmdb") {
				mmdbFile = e.Name()
				break
			}
		}
		if mmdbFile == "" {
			LogWarn("no embedded .mmdb file found in geoipdata/, GeoIP disabled")
			return
		}

		data, err := geoFS.ReadFile("geoipdata/" + mmdbFile)
		if err != nil {
			LogWarn("failed to read embedded mmdb", "error", err)
			return
		}

		geoDB, geoErr = geoip2.FromBytes(data)
		if geoErr != nil {
			LogWarn("failed to parse embedded GeoIP database", "error", geoErr)
			return
		}
		LogInfo("GeoIP enabled from embedded database: " + mmdbFile)
	})
}

func LookupIP(ipStr string) (country, city string) {
	if geoDB == nil {
		return "", ""
	}
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return "", ""
	}
	record, err := geoDB.City(ip)
	if err != nil {
		return "", ""
	}
	return record.Country.IsoCode, record.City.Names["en"]
}

func CloseGeoIP() {
	if geoDB != nil {
		geoDB.Close()
	}
}
