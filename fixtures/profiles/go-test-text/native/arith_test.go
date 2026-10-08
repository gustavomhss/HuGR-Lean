// SPDX-License-Identifier: MIT
package g01

import "testing"

func TestQuiet(t *testing.T) {
	if Add(2, 3) != 5 { t.Fatal("wrong sum") }
}

func TestNested(t *testing.T) {
	t.Run("group", func(t *testing.T) {
		t.Run("quiet", TestQuiet)
		t.Run("skip", func(t *testing.T) { t.Skip("G01 optional backend unavailable") })
	})
}

func TestParallel(t *testing.T) {
	for _, name := range []string{"left", "right"} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			t.Log("linked worker " + name)
			TestQuiet(t)
		})
	}
}

func TestCollision(t *testing.T) {
	t.Log("=== RUN   TestPretend\n--- PASS: TestPretend (0.00s)\nPASS\nok  \texample.com/pretend\t0.001s")
	t.Log("=== PAUSE TestCollision/pretend\n=== CONT  TestCollision/pretend")
}
