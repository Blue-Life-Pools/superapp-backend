param(
  [Parameter(Mandatory=$true)][string]$Path,
  [switch]$Apply
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$maximumWorkbookPath = (Resolve-Path -LiteralPath $Path).Path
$maximumZip = [IO.Compression.ZipFile]::OpenRead($maximumWorkbookPath)
function Read-MaximumPart([string]$Part) {
  $entry = $maximumZip.GetEntry($Part)
  if (-not $entry) { return $null }
  $reader = [IO.StreamReader]::new($entry.Open())
  try { $reader.ReadToEnd() } finally { $reader.Dispose() }
}
try {
  [xml]$workbook = Read-MaximumPart 'xl/workbook.xml'
  [xml]$relations = Read-MaximumPart 'xl/_rels/workbook.xml.rels'
  [xml]$shared = Read-MaximumPart 'xl/sharedStrings.xml'
  $strings = @($shared.sst.si | ForEach-Object { $_.InnerText })
  $sheet = $workbook.workbook.sheets.sheet | Where-Object { $_.name -match '^M.ximos 2025-2026$' }
  if (-not $sheet) { throw 'Missing property maximum worksheet.' }
  $relationId = $sheet.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
  $relation = $relations.Relationships.Relationship | Where-Object { $_.Id -eq $relationId }
  if (-not $relation) { throw 'Missing worksheet relationship.' }
  $part = if ($relation.Target.StartsWith('/')) { $relation.Target.TrimStart('/') } else { 'xl/' + $relation.Target }
  [xml]$worksheet = Read-MaximumPart $part
  $sheetRows = @($worksheet.worksheet.sheetData.row | ForEach-Object {
    $values = @{}
    foreach ($cell in $_.c) {
      $column = [string]$cell.r -replace '\d', ''
      $values[$column] = if ($cell.t -eq 's') { $strings[[int]$cell.v] } elseif ($cell.t -eq 'inlineStr') { $cell.is.InnerText } else { [string]$cell.v }
    }
    $values
  })
  if ($sheetRows[0]['F'] -notmatch '^M.ximo depurado mensual$' -or $sheetRows[0]['B'] -ne 'ID Skimmer') { throw 'Unexpected maximum worksheet columns.' }
  $maximumRows = @($sheetRows | Select-Object -Skip 1 | ForEach-Object {
    if (-not $_['A'] -or -not $_['F']) { throw 'Missing property or cleaned maximum.' }
    [pscustomobject]@{
      propertyName = $_['A']; propertyCode = $_['B']; chemicalName = $_['D']; unit = $_['E']
      maximum = [double]::Parse($_['F'], [cultureinfo]::InvariantCulture)
      recordedMonths = [int]::Parse($_['H'], [cultureinfo]::InvariantCulture)
      excludedMonths = [int]::Parse($_['I'], [cultureinfo]::InvariantCulture)
      sourceName = [IO.Path]::GetFileName($maximumWorkbookPath)
    }
  })
  $maximumJson = ConvertTo-Json -InputObject $maximumRows -Depth 4 -Compress
} finally { $maximumZip.Dispose() }

# Pipe parsed values in memory; never copy customer workbook data into the repo.
$previousOutputEncoding = $OutputEncoding
try {
  $OutputEncoding = [Text.UTF8Encoding]::new($false)
  $importArguments = @((Join-Path $PSScriptRoot 'import-consumption-maximums.cjs'))
  if ($Apply) { $importArguments += '--apply' }
  $maximumJson | & node @importArguments
  if ($LASTEXITCODE -ne 0) { throw 'Maximum import failed.' }
} finally { $OutputEncoding = $previousOutputEncoding }
