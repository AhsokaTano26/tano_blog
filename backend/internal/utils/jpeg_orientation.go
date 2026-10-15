package utils

import (
	"encoding/binary"
	"image"
	"io"
	"os"
)

// jpegOrientation reads only bounded JPEG metadata segments, never image pixels.
// Invalid or absent EXIF is treated like the browser's default orientation.
func jpegOrientation(f *os.File) int {
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return 1
	}
	var pair [2]byte
	if _, err := io.ReadFull(f, pair[:]); err != nil || pair != [2]byte{0xff, 0xd8} {
		return 1
	}
	for {
		if _, err := io.ReadFull(f, pair[:]); err != nil || pair[0] != 0xff {
			return 1
		}
		marker := pair[1]
		for marker == 0xff {
			if _, err := io.ReadFull(f, pair[:1]); err != nil {
				return 1
			}
			marker = pair[0]
		}
		if marker == 0xda || marker == 0xd9 {
			return 1
		}
		if marker == 0x01 || (marker >= 0xd0 && marker <= 0xd7) {
			continue
		}
		if _, err := io.ReadFull(f, pair[:]); err != nil {
			return 1
		}
		size := int(binary.BigEndian.Uint16(pair[:])) - 2
		if size < 0 {
			return 1
		}
		if marker != 0xe1 {
			if _, err := f.Seek(int64(size), io.SeekCurrent); err != nil {
				return 1
			}
			continue
		}
		segment := make([]byte, size)
		if _, err := io.ReadFull(f, segment); err != nil {
			return 1
		}
		if len(segment) < 14 || string(segment[:6]) != "Exif\x00\x00" {
			continue
		}
		tiff := segment[6:]
		var order binary.ByteOrder
		switch string(tiff[:2]) {
		case "II":
			order = binary.LittleEndian
		case "MM":
			order = binary.BigEndian
		default:
			return 1
		}
		if order.Uint16(tiff[2:4]) != 42 {
			return 1
		}
		offset := int64(order.Uint32(tiff[4:8]))
		if offset < 8 || offset+2 > int64(len(tiff)) {
			return 1
		}
		count := int(order.Uint16(tiff[offset : offset+2]))
		for i := 0; i < count; i++ {
			start := offset + 2 + int64(i)*12
			if start+12 > int64(len(tiff)) {
				return 1
			}
			entry := tiff[start : start+12]
			if order.Uint16(entry[:2]) == 0x112 && order.Uint16(entry[2:4]) == 3 && order.Uint32(entry[4:8]) == 1 {
				orientation := int(order.Uint16(entry[8:10]))
				if orientation >= 1 && orientation <= 8 {
					return orientation
				}
				return 1
			}
		}
	}
}

func orientThumbnail(src *image.NRGBA, orientation int) *image.NRGBA {
	if orientation <= 1 || orientation > 8 {
		return src
	}
	w, h := src.Bounds().Dx(), src.Bounds().Dy()
	bounds := image.Rect(0, 0, w, h)
	if orientation >= 5 {
		bounds = image.Rect(0, 0, h, w)
	}
	dst := image.NewNRGBA(bounds)
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			dx, dy := x, y
			switch orientation {
			case 2:
				dx = w - 1 - x
			case 3:
				dx, dy = w-1-x, h-1-y
			case 4:
				dy = h - 1 - y
			case 5:
				dx, dy = y, x
			case 6:
				dx, dy = h-1-y, x
			case 7:
				dx, dy = h-1-y, w-1-x
			case 8:
				dx, dy = y, w-1-x
			}
			dst.SetNRGBA(dx, dy, src.NRGBAAt(x, y))
		}
	}
	return dst
}
