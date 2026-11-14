$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not (Test-Path -LiteralPath 'node_modules/three')) { npm.cmd ci --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' } }
node scripts/build.mjs
if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
$sdkRoot = Join-Path $projectRoot 'vendor/webview2'
if (-not (Test-Path -LiteralPath "$sdkRoot/lib/net462/Microsoft.Web.WebView2.Core.dll")) {
 New-Item -ItemType Directory -Force 'vendor' | Out-Null
 curl.exe -L --fail --retry 3 'https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/1.0.4314.35/microsoft.web.webview2.1.0.4314.35.nupkg' -o 'vendor/webview2.zip'
 if ($LASTEXITCODE -ne 0) { throw 'WebView2 SDK download failed' }
 Expand-Archive -LiteralPath 'vendor/webview2.zip' -DestinationPath $sdkRoot -Force
}
$framework = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319'
$compiler = Join-Path $framework 'csc.exe'
$references = @('System.dll','System.Core.dll','System.Drawing.dll','System.Windows.Forms.dll','System.Web.Extensions.dll') | ForEach-Object { '/reference:' + (Join-Path $framework $_) }
$references += '/reference:' + (Join-Path $sdkRoot 'lib/net462/Microsoft.Web.WebView2.Core.dll')
$references += '/reference:' + (Join-Path $sdkRoot 'lib/net462/Microsoft.Web.WebView2.WinForms.dll')
$sourceFile = Join-Path $projectRoot 'native\Program.cs'
$outputFile = '/out:' + (Join-Path $projectRoot 'release\DesktopBilliards.exe')
& $compiler /nologo /target:winexe /platform:x64 /optimize+ /win32icon:native\app.ico $outputFile @references $sourceFile
if ($LASTEXITCODE -ne 0) { throw 'Native build failed' }
Copy-Item -LiteralPath "$sdkRoot/lib/net462/Microsoft.Web.WebView2.Core.dll","$sdkRoot/lib/net462/Microsoft.Web.WebView2.WinForms.dll","$sdkRoot/runtimes/win-x64/native/WebView2Loader.dll" -Destination 'release'
Copy-Item -LiteralPath "$sdkRoot/LICENSE.txt" -Destination 'release/WebView2-LICENSE.txt'
if (Test-Path -LiteralPath 'README.md') { Copy-Item -LiteralPath 'README.md' -Destination 'release/README.md' }
Write-Host 'Built: release/DesktopBilliards.exe'
