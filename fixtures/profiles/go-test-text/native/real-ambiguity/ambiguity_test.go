// SPDX-License-Identifier: MIT
package ambiguity

import "testing"

func TestParent(t *testing.T) {
	t.Run("child", func(t *testing.T) {})
}

func TestQuietFlat(t *testing.T) {}
