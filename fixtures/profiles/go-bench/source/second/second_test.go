package second

import "testing"

var sink int

func BenchmarkSecond(b *testing.B) {
	for i := 0; i < b.N; i++ { sink = Value() }
}
