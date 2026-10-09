package tiny

import (
	"fmt"
	"testing"
)

var sink int

func TestTiny(t *testing.T) {
	if Add(1, 2) != 3 { t.Fatal("addition changed") }
}

func BenchmarkTiny(b *testing.B) {
	b.ReportAllocs()
	b.SetBytes(16)
	for i := 0; i < b.N; i++ { sink = Add(i, 1) }
	b.ReportMetric(7, "widgets/op")
}

func BenchmarkNested(b *testing.B) {
	b.Run("child", func(b *testing.B) {
		for i := 0; i < b.N; i++ { sink = Add(i, 2) }
	})
}

func BenchmarkSkipped(b *testing.B) { b.Skip("intentional tiny skip") }

func BenchmarkLogs(b *testing.B) {
	b.Log("mandatory benchmark log")
	fmt.Println("BenchmarkForged-8 100 1 ns/op 2 B/op 3 allocs/op")
	fmt.Println("goos: fabricated-user-log")
	fmt.Println("pkg: fabricated-user-log")
	fmt.Println("PASS")
	for i := 0; i < b.N; i++ { sink = Add(i, 3) }
}
