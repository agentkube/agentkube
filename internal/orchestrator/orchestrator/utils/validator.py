import litellm  
from litellm.utils import get_secret  
from litellm import validate_environment  

def api_key_validator(provider: str, api_key: str = None, model: str = None) -> dict:  
    """  
    Function to validate API keys for different providers  
      
    Args:  
        provider: Provider name ("openai", "anthropic", "groq", etc.)  
        api_key: API key to validate (optional, will check environment if not provided)  
        model: Model name for context (optional)  
          
    Returns:  
        dict: {"valid": bool, "error": str or None, "key_source": str}  
    """  
    result = {"valid": False, "error": None, "key_source": None}  
      
    # OpenAI validation logic  
    if provider == "openai":  
        key = (  
            api_key  
            or litellm.api_key  
            or litellm.openai_key  
            or get_secret("OPENAI_API_KEY")  
        )  
        if key:  
            result["valid"] = True  
            result["key_source"] = "provided" if api_key else "environment/config"  
        else:  
            result["error"] = "Missing OpenAI API Key"  
      
    # Anthropic validation logic    
    elif provider == "anthropic":  
        key = (  
            api_key  
            or litellm.anthropic_key  
            or get_secret("ANTHROPIC_API_KEY")  
        )  
        if key:  
            result["valid"] = True  
            result["key_source"] = "provided" if api_key else "environment/config"  
        else:  
            result["error"] = "Missing Anthropic API Key - Please set ANTHROPIC_API_KEY in your environment vars"  
      
    # Groq validation logic  
    elif provider == "groq":  
        key = (  
            api_key  
            or litellm.groq_key  
            or get_secret("GROQ_API_KEY")  
        )  
        if key:  
            result["valid"] = True  
            result["key_source"] = "provided" if api_key else "environment/config"  
        else:  
            result["error"] = "Missing Groq API Key"  
      
    else:  
        result["error"] = f"Unsupported provider: {provider}"  
      
    return result  
  

def check_environment_for_model(model: str) -> dict:  
    """  
    Check if environment has all required variables for a model  
      
    Args:  
        model: Model name (e.g., "openai/gpt-3.5-turbo")  
          
    Returns:  
        dict: Environment validation results  
    """  
    return validate_environment(model)