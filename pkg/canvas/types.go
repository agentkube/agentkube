package canvas

// Node represents a node in the graph
type Node struct {
	ID   string                 `json:"id"`
	Type string                 `json:"type"`
	Data map[string]interface{} `json:"data"`
}

// Edge represents a connection between nodes
type Edge struct {
	ID     string `json:"id"`
	Source string `json:"source"`
	Target string `json:"target"`
	Type   string `json:"type"`
	Label  string `json:"label"`
}

// Position represents x,y coordinates of a node
type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// GraphResponse represents the final output format
type GraphResponse struct {
	Nodes []Node `json:"nodes"`
	Edges []Edge `json:"edges"`
}

// ResourceIdentifier represents a unique resource in Kubernetes
type ResourceIdentifier struct {
	Namespace    string `json:"namespace"`
	Group        string `json:"group"`
	Version      string `json:"version"`
	ResourceType string `json:"resource_type"`
	ResourceName string `json:"resource_name"`
}
