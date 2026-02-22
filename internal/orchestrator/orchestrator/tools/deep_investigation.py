"""
Past Investigation Tools

Tools for retrieving past investigations to help identify 
recurring issues and apply learnings from previous root cause analyses.
"""

from typing import Dict, Any, List
from agents import function_tool
from orchestrator.db.db import SessionLocal
from orchestrator.db.models.task import Task


def search_past_investigations_db(keywords: str, limit: int = 5) -> Dict[str, Any]:
    """
    Base function to search past investigations by keywords.
    This function contains the actual DB logic - can be tested directly.
    """
    db = SessionLocal()
    try:
        query = db.query(Task)
        
        # Split keywords and search in title, tags, matched_pattern, summary
        search_terms = keywords.strip().split()
        
        if not search_terms:
            return {
                "investigations": [],
                "total_found": 0,
                "patterns": [],
                "message": "No keywords provided"
            }
        
        # Use simple approach - filter for each term
        for term in search_terms:
            query = query.filter(
                Task.title.ilike(f"%{term}%") |
                Task.matched_pattern.ilike(f"%{term}%") |
                Task.summary.ilike(f"%{term}%")
            )
        
        # Order by most recent and limit
        tasks = query.order_by(Task.created_at.desc()).limit(limit).all()
        
        # Format results
        investigations = []
        patterns = {}
        
        for task in tasks:
            investigation = {
                "task_id": task.task_id,
                "title": task.title,
                "resolved": task.resolved,
                "summary": task.summary[:400] + "..." if task.summary and len(task.summary) > 400 else task.summary,
                "remediation": task.remediation[:400] + "..." if task.remediation and len(task.remediation) > 400 else task.remediation,
                "matched_pattern": task.matched_pattern,
                "created_at": task.created_at.isoformat() if task.created_at else None
            }
            investigations.append(investigation)
            
            if task.matched_pattern:
                patterns[task.matched_pattern] = patterns.get(task.matched_pattern, 0) + 1
        
        sorted_patterns = sorted(patterns.items(), key=lambda x: x[1], reverse=True)
        
        return {
            "investigations": investigations,
            "total_found": len(investigations),
            "patterns": [{"pattern": p[0], "count": p[1]} for p in sorted_patterns],
            "message": f"Found {len(investigations)} investigation(s) matching '{keywords}'" if investigations else f"No investigations found for '{keywords}'"
        }
        
    except Exception as e:
        import traceback
        return {
            "investigations": [],
            "total_found": 0,
            "patterns": [],
            "error": f"Search failed: {str(e)}",
            "traceback": traceback.format_exc()
        }
    finally:
        db.close()


def get_investigation_details_db(task_id: str) -> Dict[str, Any]:
    """
    Base function to get full details of a specific investigation.
    """
    db = SessionLocal()
    try:
        task = db.query(Task).filter(Task.task_id == task_id).first()
        
        if not task:
            return {"found": False, "error": f"No investigation found: {task_id}"}
        
        return {
            "found": True,
            "task_id": task.task_id,
            "title": task.title,
            "resolved": task.resolved,
            "summary": task.summary,
            "remediation": task.remediation,
            "matched_pattern": task.matched_pattern,
            "pattern_confidence": task.pattern_confidence,
            "created_at": task.created_at.isoformat() if task.created_at else None
        }
        
    except Exception as e:
        return {"found": False, "error": f"Error: {str(e)}"}
    finally:
        db.close()


# =============================================================================
# Function Tool Wrappers (for LLM use)
# =============================================================================

@function_tool
def get_past_investigations(keywords: str, limit: int = 5) -> Dict[str, Any]:
    """
    Search past investigations by keywords.
    
    Use this tool to find previous investigations for similar issues.
    
    Args:
        keywords: Search terms like resource name, error type, or namespace
                  Examples: "payment-service", "CrashLoopBackOff", "production"
        limit: Maximum results to return (default: 5)
    
    Returns:
        List of matching investigations with summaries and remediations
    """
    return search_past_investigations_db(keywords, limit)


@function_tool
def get_investigation_details(task_id: str) -> Dict[str, Any]:
    """
    Get full details of a specific investigation.
    
    Args:
        task_id: The task ID from get_past_investigations results
    
    Returns:
        Complete investigation with full summary and remediation
    """
    return get_investigation_details_db(task_id)
