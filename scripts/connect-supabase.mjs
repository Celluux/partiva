import { spawnSync } from "node:child_process";
if (process.platform !== "win32")
  throw new Error(
    "Este assistente de configuração usa a proteção DPAPI do Windows.",
  );
// The credential is read by PowerShell itself, in the user's local terminal.
// It never enters Node's arguments, console output, Git or a plaintext file.
const script = String.raw`
$ErrorActionPreference='Stop'
$root=Join-Path $env:LOCALAPPDATA 'Partiva'
$directory=Join-Path $root 'CodexCredentials'
foreach($entry in @($root,$directory)){if(Test-Path -LiteralPath $entry){if((Get-Item -LiteralPath $entry).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Diretório de credenciais redirecionado. Configuração interrompida.'}}else{New-Item -ItemType Directory -Path $entry | Out-Null}}
$path=Join-Path $directory 'supabase-cli-token.dpapi'
if(Test-Path -LiteralPath $path){if((Get-Item -LiteralPath $path).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Arquivo de credenciais redirecionado.'}}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent().User
$acl=New-Object Security.AccessControl.DirectorySecurity
$acl.SetOwner($identity)
$acl.SetAccessRuleProtection($true,$false)
$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
$systemIdentity=New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($systemIdentity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
Set-Acl -LiteralPath $directory -AclObject $acl
$secret=Read-Host 'Cole o token Supabase (entrada oculta; nao sera mostrado)' -AsSecureString
try{if($secret.Length -lt 20){throw 'Token ausente ou incompleto. Nada foi gravado.'};$encrypted=ConvertFrom-SecureString -SecureString $secret;[IO.File]::WriteAllText($path,$encrypted,[Text.Encoding]::UTF8);Write-Output 'Credencial protegida pelo Windows e salva fora do projeto. Nenhum token foi exibido.'}finally{$secret.Dispose()}
`;
const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], {
  stdio: "inherit",
});
process.exitCode = result.status ?? 1;
