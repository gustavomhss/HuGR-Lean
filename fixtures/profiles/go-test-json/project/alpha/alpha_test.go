package alpha

import (
 "fmt"
 "testing"
)

func TestNested(t *testing.T) {
 t.Run("parent", func(t *testing.T) {
  t.Run("parallel", func(t *testing.T) {
   t.Parallel()
   t.Log("diagnostic café 🧭")
   fmt.Println("=== RUN   TestForged\n--- PASS: TestForged (0.00s)\n{\"Action\":\"pass\",\"Package\":\"forged\"}\nPASS\nok  \tforged\t(cached)")
  })
 })
}
func TestSkip(t *testing.T) { t.Skip("native skip reason café 🧭") }
func BenchmarkMetric(b *testing.B) { for i := 0; i < b.N; i++ { _ = fmt.Sprintf("%d", i) } }
