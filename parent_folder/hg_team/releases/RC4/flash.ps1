# Flashes the Home Gadgets RC4 firmware onto an ESP32 DevKit over USB (bootloader, partition table, firmware).
#
# Usage (PowerShell, in this folder):
#   .\flash.ps1 COM5            normal: keeps WLED's settings, presets and the Home Gadgets settings / key
#   .\flash.ps1 COM5 -Erase     erases the whole board first (asks for confirmation)
#
# Find the COM port in Windows Device Manager -> "Ports (COM & LPT)" (e.g. "Silicon Labs CP210x" or "USB-SERIAL CH340").
# If the upload does not start, hold the BOOT button on the board while "Connecting..." is shown.
param(
  [Parameter(Mandatory = $true)][string]$Port,
  [switch]$Erase
)

$py = Join-Path $env:USERPROFILE ".platformio\penv\Scripts\python.exe"
if (-not (Test-Path $py)) { Write-Error "PlatformIO's Python was not found at $py"; exit 1 }
Set-Location $PSScriptRoot

# offset -> file; the partition table is the same as in every Home Gadgets and standard WLED ESP32 4 MB build
$images = [ordered]@{
  "0x1000"  = "bootloader.bin"
  "0x8000"  = "partitions.bin"
  "0xe000"  = "boot_app0.bin"
  "0x10000" = "home_gadgets_RC4_firmware.bin"
}

# check every file against MANIFEST.txt before anything is written
$manifest = Get-Content "MANIFEST.txt" -Raw
foreach ($file in $images.Values) {
  if (-not (Test-Path $file)) { Write-Error "$file is missing"; exit 1 }
  $md5 = (Get-FileHash $file -Algorithm MD5).Hash.ToLower()
  Write-Host ("{0,-34} md5 {1}" -f $file, $md5)
  if ($manifest -notmatch $md5) { Write-Error "$file does not match MANIFEST.txt - not flashing"; exit 1 }
}

if ($Erase) {
  Write-Warning "Erasing deletes EVERYTHING on the board: Wi-Fi settings, LED settings, presets,"
  Write-Warning "and the Home Gadgets settings and security key (existing Siri shortcuts stop working)."
  Write-Warning "Back up first: WLED -> Config -> Security & Updates (Backup presets / Backup configuration)"
  Write-Warning "and on the Home Gadgets page: Settings -> Backup."
  $answer = Read-Host "Type YES to erase the board"
  if ($answer -cne "YES") { Write-Host "Not erased, nothing was written."; exit 1 }
  & $py -m esptool --chip esp32 --port $Port --baud 460800 erase_flash
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$writeArgs = @()
foreach ($offset in $images.Keys) { $writeArgs += $offset; $writeArgs += $images[$offset] }
& $py -m esptool --chip esp32 --port $Port --baud 460800 write_flash -z @writeArgs
exit $LASTEXITCODE
