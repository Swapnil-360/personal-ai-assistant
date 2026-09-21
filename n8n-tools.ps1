<#
.SYNOPSIS
    n8n Local Management Utility for Swapnil AI
.DESCRIPTION
    Provides functions to interact with the local n8n instance at http://localhost:5678
    using the n8n Public REST API.
#>

$global:N8N_BASE_URL = "http://localhost:5678/api/v1"

function Get-N8NHeaders {
    if (-not $env:N8N_API_KEY) {
        Write-Warning "N8N_API_KEY environment variable is not set. Please set `$env:N8N_API_KEY."
    }
    return @{
        "X-N8N-API-KEY" = $env:N8N_API_KEY
        "Content-Type"  = "application/json"
    }
}

function Get-N8NWorkflows {
    [CmdletBinding()]
    param()
    $headers = Get-N8NHeaders
    $response = Invoke-RestMethod -Uri "$global:N8N_BASE_URL/workflows" -Headers $headers -Method Get
    return $response.data
}

function Get-N8NWorkflow {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$WorkflowId
    )
    $headers = Get-N8NHeaders
    return Invoke-RestMethod -Uri "$global:N8N_BASE_URL/workflows/$WorkflowId" -Headers $headers -Method Get
}

function Push-N8NWorkflow {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$WorkflowId,
        [Parameter(Mandatory=$true)]
        [string]$FilePath
    )
    $headers = Get-N8NHeaders
    if (-not (Test-Path $FilePath)) {
        throw "Workflow file not found: $FilePath"
    }

    $raw = Get-Content -Path $FilePath -Raw | ConvertFrom-Json
    
    # n8n API PUT expects { name, nodes, connections, settings }
    $payload = @{
        name        = $raw.name
        nodes       = $raw.nodes
        connections = $raw.connections
        settings    = if ($raw.settings) { $raw.settings } else { @{} }
    } | ConvertTo-Json -Depth 100

    $updated = Invoke-RestMethod -Uri "$global:N8N_BASE_URL/workflows/$WorkflowId" -Headers $headers -Method Put -Body $payload
    Write-Host "Successfully updated workflow '$($updated.name)' (ID: $WorkflowId) in local n8n." -ForegroundColor Green
    return $updated
}

function Pull-N8NWorkflow {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$WorkflowId,
        [Parameter(Mandatory=$true)]
        [string]$FilePath
    )
    $wf = Get-N8NWorkflow -WorkflowId $WorkflowId
    $jsonContent = $wf | ConvertTo-Json -Depth 100
    Set-Content -Path $FilePath -Value $jsonContent -Encoding utf8
    Write-Host "Exported workflow '$($wf.name)' (ID: $WorkflowId) to $FilePath." -ForegroundColor Green
}

function Get-N8NExecutions {
    [CmdletBinding()]
    param(
        [int]$Limit = 10
    )
    $headers = Get-N8NHeaders
    $res = Invoke-RestMethod -Uri "$global:N8N_BASE_URL/executions?limit=$Limit" -Headers $headers -Method Get
    return $res.data
}

function Get-N8NExecutionDetails {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$ExecutionId
    )
    $headers = Get-N8NHeaders
    return Invoke-RestMethod -Uri "$global:N8N_BASE_URL/executions/$ExecutionId`?includeData=true" -Headers $headers -Method Get
}

Write-Host "n8n-tools loaded! Available functions:" -ForegroundColor Cyan
Write-Host " - Get-N8NWorkflows"
Write-Host " - Get-N8NWorkflow -WorkflowId <id>"
Write-Host " - Push-N8NWorkflow -WorkflowId <id> -FilePath <path>"
Write-Host " - Pull-N8NWorkflow -WorkflowId <id> -FilePath <path>"
Write-Host " - Get-N8NExecutions -Limit <n>"
Write-Host " - Get-N8NExecutionDetails -ExecutionId <id>"
