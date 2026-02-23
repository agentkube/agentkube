import subprocess
from orchestrator.db.models.command import ExecuteCommandResponse
from config import get_settings

class CommandService:
    """Service for executing kubectl commands"""
    
    @staticmethod
    def execute_command(command: str, kubecontext: str, timeout: int = 30) -> ExecuteCommandResponse:
        """
        Execute a kubectl command and return the result.
        
        Args:
            command: The kubectl command to execute
            kubecontext: The Kubernetes context to use
            timeout: Maximum execution time in seconds
            
        Returns:
            ExecuteCommandResponse object with success status, command and output
        """
        if not command.startswith("kubectl"):
            return ExecuteCommandResponse(
                success=False, 
                command=command,
                output="Error: Only kubectl commands are allowed"
            )
            
        try:
            # Get kubectl path from settings
            settings = get_settings()
            kubectl_path = settings.get("general", {}).get("kubectlPath", "kubectl")
            
            # Replace 'kubectl' with the configured path
            if command.startswith("kubectl"):
                command = command.replace("kubectl", kubectl_path, 1)
            
            # Add context to the command
            full_command = f'{command} --context {kubecontext}'
            
            result = subprocess.run(
                full_command,
                shell=True,
                check=True,
                capture_output=True,
                text=True,
                timeout=timeout 
            )
            
            return ExecuteCommandResponse(
                success=True,
                command=command,
                output=result.stdout,
            )
            
        except subprocess.CalledProcessError as e:
            return ExecuteCommandResponse(
                success=False,
                command=command,
                output=f"Error: {e.stderr}",
            )
        except subprocess.TimeoutExpired:
            return ExecuteCommandResponse(
                success=False,
                command=command,
                output="Error: Command execution timed out",
            )
        except Exception as e:
            return ExecuteCommandResponse(
                success=False,
                command=command,
                output=f"Error: {str(e)}"
            )