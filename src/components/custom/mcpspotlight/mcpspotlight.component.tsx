import React, { memo, useCallback, useMemo } from 'react';
import { Server, Wifi, WifiOff } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

interface MCPServer {
  name: string;
  enabled: boolean;
  command?: string;
  args?: string[];
  url?: string;
  transport: 'stdio' | 'sse';
  env?: Record<string, string>;
  connected?: boolean;
  tools_count?: number;
}

interface MCPServerSpotlightProps {
  servers: MCPServer[];
  onServerSelect: (server: MCPServer) => void;
  onToggleEnabled: (serverName: string, enabled: boolean) => void;
  query: string;
  activeIndex: number;
}

// Memoized TransportIcon component
const TransportIcon = memo(({ transport, connected }: { transport: string; connected?: boolean }) => {
  const iconColor = connected ? 'text-green-500' : 'text-gray-400';

  switch (transport) {
    case 'stdio':
      return <Server className={`w-5 h-5 ${iconColor}`} />;
    case 'sse':
      return connected ? <Wifi className={`w-5 h-5 ${iconColor}`} /> : <WifiOff className={`w-5 h-5 ${iconColor}`} />;
    default:
      return <Server className={`w-5 h-5 ${iconColor}`} />;
  }
});

TransportIcon.displayName = 'TransportIcon';

const MCPServerSpotlight: React.FC<MCPServerSpotlightProps> = ({
  servers,
  onServerSelect,
  onToggleEnabled,
  query,
  activeIndex
}) => {
  // Memoize filtered servers to prevent unnecessary recalculations
  const filteredServers = useMemo(() =>
    servers.filter(server =>
      server.name.toLowerCase().includes(query.toLowerCase())
    ), [servers, query]
  );

  return (
    <div className="py-1">
      {filteredServers.length === 0 ? (
        <div className="text-gray-500 p-4 text-center">
          No MCP servers found matching "{query}"
        </div>
      ) : (
        filteredServers.map((server, index) => (
          <ServerRow
            key={server.name}
            server={server}
            index={index}
            activeIndex={activeIndex}
            onServerSelect={onServerSelect}
            onToggleEnabled={onToggleEnabled}
          />
        ))
      )}
    </div>
  );
};

// Memoized ServerRow component for better performance
const ServerRow = memo(({
  server,
  index,
  activeIndex,
  onServerSelect,
  onToggleEnabled
}: {
  server: MCPServer;
  index: number;
  activeIndex: number;
  onServerSelect: (server: MCPServer) => void;
  onToggleEnabled: (serverName: string, enabled: boolean) => void;
}) => {
  const handleServerClick = useCallback(() => {
    onServerSelect(server);
  }, [server, onServerSelect]);

  const handleToggle = useCallback((checked: boolean) => {
    onToggleEnabled(server.name, checked);
  }, [server.name, onToggleEnabled]);

  const handleSwitchClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div
      className={`flex items-center px-4 py-2 ${index === activeIndex ? 'bg-accent' : 'hover:bg-accent-hover'
        }`}
    >
      <div className="w-6 h-6 mr-3 flex items-center justify-center">
        <TransportIcon transport={server.transport} connected={server.connected} />
      </div>
      <div
        className="flex-1 cursor-pointer"
        onClick={handleServerClick}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{server.name}</span>
            <span className={`text-xs px-2 py-0.3 rounded ${server.enabled
              ? 'bg-green-100 text-green-700'
              : 'bg-secondary text-muted-foreground'
              }`}>
              {server.enabled ? 'Enabled' : 'Disabled'}
            </span>
            <span className="bg-secondary text-foreground px-1.5 py-0.3 rounded text-xs mr-2">
              {server.transport}
            </span>
          </div>
        </div>
        <div className="text-xs text-gray-500 w-96 truncate">

          {server.transport === 'stdio' && server.command && (
            <span>{server.command} {server.args?.join(' ')}</span>
          )}
          {server.transport === 'sse' && server.url && (
            <span>{server.url}</span>
          )}
          {server.tools_count !== undefined && (
            <span className="ml-2 text-blue-600">
              {server.tools_count} tools
            </span>
          )}
        </div>
      </div>
      <div className="ml-2 flex items-center">
        <Switch
          checked={server.enabled}
          onCheckedChange={handleToggle}
          onClick={handleSwitchClick}
        />
      </div>
    </div>
  );
});

ServerRow.displayName = 'ServerRow';

export default memo(MCPServerSpotlight);