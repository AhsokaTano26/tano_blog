package utils

import (
	"fmt"
	"image"
	_ "image/gif"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"strings"

	_ "golang.org/x/image/bmp"
	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

// Bound concurrent decoding and decoded dimensions, rather than compressed file
// size: a small PNG can still require hundreds of megabytes of memory.
var thumbnailSlot = make(chan struct{}, 1)

// GenerateImageThumbnail writes a separate, at-most-480px preview. Originals
// (including animated GIFs) remain untouched; transparent previews stay PNG.
func GenerateImageThumbnail(path string) (string, error) {
	thumbnailSlot <- struct{}{}
	defer func() { <-thumbnailSlot }()
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	cfg, _, err := image.DecodeConfig(f)
	if err != nil {
		return "", err
	}
	if cfg.Width <= 0 || cfg.Height <= 0 || int64(cfg.Width)*int64(cfg.Height) > 32_000_000 {
		return "", fmt.Errorf("image dimensions exceed thumbnail decoding limit")
	}
	orientation := jpegOrientation(f)
	if _, err := f.Seek(0, 0); err != nil {
		return "", err
	}
	src, _, err := image.Decode(f)
	if err != nil {
		return "", err
	}
	w, h := cfg.Width, cfg.Height
	if w > 480 || h > 480 {
		if w >= h {
			h, w = max(1, h*480/w), 480
		} else {
			w, h = max(1, w*480/h), 480
		}
	}
	dst := image.NewNRGBA(image.Rect(0, 0, w, h))
	draw.ApproxBiLinear.Scale(dst, dst.Bounds(), src, src.Bounds(), draw.Src, nil)
	dst = orientThumbnail(dst, orientation)
	ext := ".jpg"
	if !dst.Opaque() {
		ext = ".png"
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".thumbnail-*")
	if err != nil {
		return "", err
	}
	defer os.Remove(tmp.Name())
	// Each invocation owns its output, so a losing concurrent backfill can safely
	// remove its own file without deleting another process's published preview.
	suffix := strings.TrimPrefix(filepath.Base(tmp.Name()), ".thumbnail-")
	name := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path)) + "_thumb_" + suffix + ext
	if ext == ".png" {
		err = (&png.Encoder{CompressionLevel: png.BestSpeed}).Encode(tmp, dst)
	} else {
		err = jpeg.Encode(tmp, dst, &jpeg.Options{Quality: 78})
	}
	closeErr := tmp.Close()
	if err != nil {
		return "", err
	}
	if closeErr != nil {
		return "", closeErr
	}
	if err := os.Chmod(tmp.Name(), 0644); err != nil {
		return "", err
	}
	if err := os.Rename(tmp.Name(), filepath.Join(filepath.Dir(path), name)); err != nil {
		return "", err
	}
	return "/uploads/" + name, nil
}
