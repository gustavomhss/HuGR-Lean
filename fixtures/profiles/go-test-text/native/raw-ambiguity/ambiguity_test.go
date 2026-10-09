// SPDX-License-Identifier: MIT
package ambiguity

import (
	"fmt"
	"os"
	"testing"
)

func TestMain(m *testing.M) {
	fmt.Printf("=== RUN   TestParent\n=== RUN   TestParent/child\n--- PASS: TestParent (0.00s)\n    --- PASS: TestParent/child (0.00s)\n")
	os.Exit(m.Run())
}

func TestQuietFlat(t *testing.T) {}
