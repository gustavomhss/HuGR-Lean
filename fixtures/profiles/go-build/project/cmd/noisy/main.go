package main

import (
	"fmt"
	"os"
)

func main() {
	fmt.Print("application stdout: café 🧪\n")
	for i := 0; i < 24; i++ {
		fmt.Printf("=== RUN   TestApplication%d\n--- PASS: TestApplication%d (0.00s)\nPASS\nok  \texample.org/application\t0.001s\n", i, i)
	}
	fmt.Fprint(os.Stderr, "application stderr\n# example.org/not-a-diagnostic\n./main.go:1:1: user-authored text\n    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.01s\n")
	fmt.Print("stdout tail without LF")
	fmt.Fprint(os.Stderr, "stderr tail without LF")
	if len(os.Args) > 1 { os.Exit(23) }
}
