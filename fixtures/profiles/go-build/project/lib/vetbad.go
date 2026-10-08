//go:build vetbad

package lib

import "fmt"

func BadFormat() { fmt.Printf("%d", "native vet diagnostic") }
