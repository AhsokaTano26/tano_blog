package utils

import (
	"bytes"
	"encoding/binary"
	"hash/crc32"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"testing"
)

func TestImageThumbnailKeepsOriginalAndAspectRatio(t *testing.T) {
	dir := t.TempDir()
	original := filepath.Join(dir, "photo.png")
	img := image.NewNRGBA(image.Rect(0, 0, 1200, 600))
	for i := 0; i < len(img.Pix); i += 4 {
		img.Pix[i], img.Pix[i+3] = 220, 255
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	before := append([]byte(nil), buf.Bytes()...)
	if err := os.WriteFile(original, before, 0644); err != nil {
		t.Fatal(err)
	}
	url, err := GenerateImageThumbnail(original)
	if err != nil {
		t.Fatal(err)
	}
	thumb, err := os.Open(filepath.Join(dir, filepath.Base(url)))
	if err != nil {
		t.Fatal(err)
	}
	defer thumb.Close()
	config, _, err := image.DecodeConfig(thumb)
	if err != nil {
		t.Fatal(err)
	}
	if config.Width != 480 || config.Height != 240 {
		t.Fatalf("unexpected thumbnail dimensions: %dx%d", config.Width, config.Height)
	}
	after, _ := os.ReadFile(original)
	if !bytes.Equal(before, after) {
		t.Fatal("thumbnail generation changed the original")
	}
}

func TestImageThumbnailAppliesJPEGOrientation(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 40, 20))
	colors := []color.NRGBA{{R: 240, A: 255}, {G: 240, A: 255}, {B: 240, A: 255}, {R: 240, G: 240, A: 255}}
	for y := 0; y < 20; y++ {
		for x := 0; x < 40; x++ {
			index := 0
			if x >= 20 {
				index++
			}
			if y >= 10 {
				index += 2
			}
			img.SetNRGBA(x, y, colors[index])
		}
	}
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, img, &jpeg.Options{Quality: 100}); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		orientation             byte
		width, height, quadrant int
	}{
		{1, 40, 20, 0}, {2, 40, 20, 1}, {3, 40, 20, 3}, {4, 40, 20, 2},
		{5, 20, 40, 0}, {6, 20, 40, 2}, {7, 20, 40, 3}, {8, 20, 40, 1},
	} {
		t.Run(string(rune('0'+tc.orientation)), func(t *testing.T) {
			dir := t.TempDir()
			path := filepath.Join(dir, "phone.jpg")
			exif := []byte{'E', 'x', 'i', 'f', 0, 0, 'I', 'I', 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, tc.orientation, 0, 0, 0, 0, 0, 0, 0}
			data := append([]byte{0xff, 0xd8, 0xff, 0xe1, 0, byte(len(exif) + 2)}, exif...)
			data = append(data, encoded.Bytes()[2:]...)
			if err := os.WriteFile(path, data, 0644); err != nil {
				t.Fatal(err)
			}
			url, err := GenerateImageThumbnail(path)
			if err != nil {
				t.Fatal(err)
			}
			f, err := os.Open(filepath.Join(dir, filepath.Base(url)))
			if err != nil {
				t.Fatal(err)
			}
			defer f.Close()
			thumb, _, err := image.Decode(f)
			if err != nil {
				t.Fatal(err)
			}
			if thumb.Bounds().Dx() != tc.width || thumb.Bounds().Dy() != tc.height {
				t.Fatalf("wrong oriented bounds: %v", thumb.Bounds())
			}
			got := color.NRGBAModel.Convert(thumb.At(2, 2)).(color.NRGBA)
			want := colors[tc.quadrant]
			for _, channel := range [][2]uint8{{got.R, want.R}, {got.G, want.G}, {got.B, want.B}} {
				if abs(int(channel[0])-int(channel[1])) > 35 {
					t.Fatalf("orientation %d: wrong top-left color: %v", tc.orientation, got)
				}
			}
		})
	}
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

func TestImageThumbnailPreservesTransparencyWithoutUpscaling(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "transparent.png")
	img := image.NewNRGBA(image.Rect(0, 0, 80, 40))
	img.Set(0, 0, color.NRGBA{R: 255, A: 128})
	f, _ := os.Create(path)
	if err := png.Encode(f, img); err != nil {
		t.Fatal(err)
	}
	f.Close()
	url, err := GenerateImageThumbnail(path)
	if err != nil {
		t.Fatal(err)
	}
	f, err = os.Open(filepath.Join(dir, filepath.Base(url)))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	thumb, _, err := image.Decode(f)
	if err != nil {
		t.Fatal(err)
	}
	if thumb.Bounds().Dx() != 80 || thumb.Bounds().Dy() != 40 {
		t.Fatalf("small image was resized: %v", thumb.Bounds())
	}
	_, _, _, alpha := thumb.At(79, 39).RGBA()
	if alpha != 0 {
		t.Fatal("transparent pixels became opaque")
	}
}

func TestImageThumbnailRejectsCorruptAndOversizedImages(t *testing.T) {
	var buf bytes.Buffer
	if err := png.Encode(&buf, image.NewRGBA(image.Rect(0, 0, 1, 1))); err != nil {
		t.Fatal(err)
	}
	oversized := append([]byte(nil), buf.Bytes()...)
	binary.BigEndian.PutUint32(oversized[16:20], 100000)
	binary.BigEndian.PutUint32(oversized[20:24], 100000)
	binary.BigEndian.PutUint32(oversized[29:33], crc32.ChecksumIEEE(oversized[12:29]))
	for name, data := range map[string][]byte{"corrupt.png": []byte("not an image"), "oversized.png": oversized} {
		t.Run(name, func(t *testing.T) {
			dir := t.TempDir()
			path := filepath.Join(dir, name)
			if err := os.WriteFile(path, data, 0644); err != nil {
				t.Fatal(err)
			}
			if url, err := GenerateImageThumbnail(path); err == nil || url != "" {
				t.Fatalf("invalid image accepted: url=%q error=%v", url, err)
			}
			files, _ := os.ReadDir(dir)
			if len(files) != 1 {
				t.Fatal("failed generation left thumbnail files behind")
			}
		})
	}
}
