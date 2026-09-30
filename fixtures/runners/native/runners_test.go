package runners

import "testing"

func TestArithmetic(t *testing.T) {
	if 2+2 != 4 { t.Fatal("arithmetic") }
}

func TestCafé(t *testing.T) {
	if len("🔥") != 4 { t.Fatal("UTF-8") }
}

func TestSkipped(t *testing.T) { t.SkipNow() }
