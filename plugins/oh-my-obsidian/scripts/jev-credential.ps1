param(
  [ValidateSet('Set', 'Get', 'Status', 'Delete')][string]$Action,
  [ValidatePattern('^oh-my-obsidian/jev(?:/test-[a-f0-9-]{36})?$')][string]$TargetName = 'oh-my-obsidian/jev'
)
$ErrorActionPreference = 'Stop'
$osError = 0
$stage = 'load-type'
try {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class OmobCredential {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct Credential {
    public uint Flags, Type;
    public string TargetName, Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist, AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias, UserName;
  }
  [DllImport("advapi32.dll", EntryPoint="CredWriteW", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool Write(ref Credential credential, uint flags);
  [DllImport("advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool Read(string target, uint type, uint flags, out IntPtr credential);
  [DllImport("advapi32.dll", EntryPoint="CredDeleteW", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool Delete(string target, uint type, uint flags);
  [DllImport("advapi32.dll", EntryPoint="CredFree")]
  public static extern void Free(IntPtr credential);
}
'@
  $target = $TargetName
  if ($Action -eq 'Set') {
    $stage = 'read-input'
    $secret = Read-Host 'Jev API key (hidden; stored in Windows Credential Manager)' -AsSecureString
    $pointer = [IntPtr]::Zero
    try {
      $stage = 'convert-input'
      $pointer = [Runtime.InteropServices.Marshal]::SecureStringToCoTaskMemUnicode($secret)
      $value = [Runtime.InteropServices.Marshal]::PtrToStringUni($pointer)
      $stage = 'validate-input'
      if ($value.Length -lt 8 -or $value.Length -gt 1024 -or $value -match '[^\x21-\x7e]') { throw 'Invalid key' }
      $credential = New-Object OmobCredential+Credential
      $credential.Type = 1
      $credential.TargetName = $target
      $credential.UserName = 'oh-my-obsidian'
      $credential.Persist = 2
      $credential.CredentialBlobSize = $value.Length * 2
      $credential.CredentialBlob = $pointer
      $stage = 'write-credential'
      if (-not [OmobCredential]::Write([ref]$credential, 0)) {
        $osError = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        throw 'Credential write failed'
      }
    } finally {
      $value = $null
      if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeCoTaskMemUnicode($pointer) }
      $secret.Dispose()
    }
  } elseif ($Action -eq 'Delete') {
    if (-not [OmobCredential]::Delete($target, 1, 0) -and [Runtime.InteropServices.Marshal]::GetLastWin32Error() -ne 1168) { throw 'Credential delete failed' }
  } else {
    $pointer = [IntPtr]::Zero
    $found = [OmobCredential]::Read($target, 1, 0, [ref]$pointer)
    if (-not $found -and [Runtime.InteropServices.Marshal]::GetLastWin32Error() -ne 1168) { throw 'Credential read failed' }
    try {
      if ($Action -eq 'Status') { [Console]::Write($(if ($found) { 'present' } else { 'absent' })) }
      elseif ($found) {
        $credential = [Runtime.InteropServices.Marshal]::PtrToStructure($pointer, [type][OmobCredential+Credential])
        [Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringUni($credential.CredentialBlob, $credential.CredentialBlobSize / 2))
      }
    } finally { if ($pointer -ne [IntPtr]::Zero) { [OmobCredential]::Free($pointer) } }
  }
} catch {
  [Console]::Error.WriteLine("Jev credential operation failed (stage=$stage, osError=$osError). No plaintext fallback was used.")
  exit 1
}
