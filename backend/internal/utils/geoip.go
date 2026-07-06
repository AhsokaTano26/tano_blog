package utils

import (
    "net"
    "os"
    "sync"

    "github.com/oschwald/geoip2-golang"
)

var (
    geoDB   *geoip2.Reader
    geoOnce sync.Once
    geoErr  error
)

func InitGeoIP() {
    path := os.Getenv("GEOIP_DB_PATH")
    if path == "" {
        LogWarn("GEOIP_DB_PATH not set, GeoIP disabled")
        return
    }
    geoOnce.Do(func() {
        geoDB, geoErr = geoip2.Open(path)
        if geoErr != nil {
            LogWarn("failed to open GeoIP database", "error", geoErr)
        }
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
