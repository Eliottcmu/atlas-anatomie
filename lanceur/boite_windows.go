//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

// boiteWindows affiche une boîte de message native (MessageBoxW), sans dépendance externe.
func boiteWindows(titre, message string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	boite := user32.NewProc("MessageBoxW")
	t, _ := syscall.UTF16PtrFromString(titre)
	m, _ := syscall.UTF16PtrFromString(message)
	const iconeErreur = 0x10
	boite.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), iconeErreur)
}
