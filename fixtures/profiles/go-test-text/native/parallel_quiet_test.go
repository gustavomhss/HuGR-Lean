// SPDX-License-Identifier: MIT
package g01

import "testing"

func TestParallelQuiet(t *testing.T) {
	for _, name := range []string{"one", "two"} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			TestQuiet(t)
		})
	}
}
