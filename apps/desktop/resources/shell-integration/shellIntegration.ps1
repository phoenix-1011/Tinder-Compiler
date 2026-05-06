# ---------------------------------------------------------------------------
# Tinder Compiler — PowerShell Shell Integration
#
# Adapted from the VS Code shell integration script (MIT License).
# Source: https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminal/common/scripts/shellIntegration.ps1
#
# Emits OSC 633 sequences so the renderer can detect:
#   ]633;A  prompt start
#   ]633;B  prompt end (command start)
#   ]633;C  pre-execution marker (after Enter)
#   ]633;D;<exitCode>  command finished
#   ]633;E;<commandLine>  the command that ran
#   ]633;P;Cwd=<path>    current working directory
# ---------------------------------------------------------------------------

if ($env:TINDER_SHELL_INTEGRATION_INJECTED -eq "1") { return }
$env:TINDER_SHELL_INTEGRATION_INJECTED = "1"

# Avoid running inside a non-interactive host.
if (!([Environment]::UserInteractive)) { return }

$Global:__TinderOriginalPrompt = $function:Prompt

function Global:__Tinder-Escape-Value {
    param([Parameter(ValueFromPipeline = $true)][string]$value)
    process {
        if ([string]::IsNullOrEmpty($value)) { return "" }
        $sb = [System.Text.StringBuilder]::new($value.Length)
        for ($i = 0; $i -lt $value.Length; $i++) {
            $c = $value[$i]
            $code = [int]$c
            if ($code -lt 0x20 -or $code -eq 0x3b -or $code -eq 0x5c -or $code -gt 0x7e) {
                [void]$sb.Append(("\x{0:x2}" -f $code))
            } else {
                [void]$sb.Append($c)
            }
        }
        $sb.ToString()
    }
}

function Global:Prompt() {
    $LastExitCode = $global:LASTEXITCODE
    $LastSuccess = $?
    $resolvedExit = if ($LastSuccess -or $LastExitCode -eq 0) { 0 } else { if ($LastExitCode) { $LastExitCode } else { 1 } }

    $result = ""
    # Mark previous command as finished (D);  on the very first prompt this still fires with 0 which is harmless.
    $result += "$([char]0x1b)]633;D;$resolvedExit$([char]0x07)"
    # Prompt start (A)
    $result += "$([char]0x1b)]633;A$([char]0x07)"
    # Cwd (P)
    try {
        $cwd = (Get-Location).Path | __Tinder-Escape-Value
        $result += "$([char]0x1b)]633;P;Cwd=$cwd$([char]0x07)"
    } catch {}

    # Original prompt content
    $originalPrompt = ""
    try { $originalPrompt = & $Global:__TinderOriginalPrompt } catch { $originalPrompt = "PS> " }
    $result += $originalPrompt

    # Prompt end / command start (B)
    $result += "$([char]0x1b)]633;B$([char]0x07)"
    return $result
}

# Pre-execution marker via PSReadLine, if available.
if (Get-Module -ListAvailable -Name PSReadLine) {
    try {
        Import-Module PSReadLine -ErrorAction SilentlyContinue
        Set-PSReadLineKeyHandler -Key Enter -ScriptBlock {
            $line = $null
            $cursor = $null
            [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$line, [ref]$cursor)
            if ($null -ne $line -and $line.Length -gt 0) {
                $escaped = $line | __Tinder-Escape-Value
                [Console]::Write("$([char]0x1b)]633;E;$escaped$([char]0x07)")
                [Console]::Write("$([char]0x1b)]633;C$([char]0x07)")
            }
            [Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine()
        }
    } catch {}
}
