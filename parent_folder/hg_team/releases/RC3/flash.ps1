# Flashes the Home Gadgets RC3 firmware onto an ESP32 DevKit over USB (full flash: bootloader, partitions, firmware).
# Usage (PowerShell, in this folder):   .\flash.ps1 COM5
# Find the COM port in Windows Device Manager -> "Ports (COM & LPT)" (e.g. "Silicon Labs CP210x" or "USB-SERIAL CH340").
# If the upload does not start, hold the BOOT button on the board while "Connecting..." is shown.
param([Parameter(Mandatory = $true)][string]$Port)

$py = Join-Path $env:USERPROFILE ".platformio\penv\Scripts\python.exe"
if (-not (Test-Path $py)) { Write-Error "PlatformIO's Python was not found at $py"; exit 1 }
Set-Location $PSScriptRoot

# erase first: a fresh start for the file system and NVS (the board has never run this firmware)
& $py -m esptool --chip esp32 --port $Port --baud 460800 erase_flash
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $py -m esptool --chip esp32 --port $Port --baud 460800 write_flash -z `
  0x1000 bootloader.bin 0x8000 partitions.bin 0xe000 boot_app0.bin 0x10000 firmware.bin
exit $LASTEXITCODE
