import React, { useState, useMemo } from 'react';
import { AlertTriangle, ChevronRight, ChevronDown, Clock, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Span {
  spanId: string;
  operationName: string;
  serviceName: string;
  startTime: number;
  duration: number;
  status: 'OK' | 'ERROR';
  depth: number;
  hasChildren: boolean;
  parentSpanId?: string;
  tags: Array<{ key: string; value: string }>;
  logs: Array<{ timestamp: number; fields: Array<{ key: string; value: string }> }>;
}

interface Trace {
  traceId: string;
  spans: Span[];
  startTime: number;
  duration: number;
  endpoint: string;
  status: 'success' | 'error' | 'timeout';
}

// Mock trace data with multiple endpoints
const MOCK_TRACES: Trace[] = [
  {
    traceId: '15:26:33-15:26:35',
    endpoint: '/api/checkout',
    status: 'error',
    startTime: Date.now() - 300000,
    duration: 1200,
    spans: [
    {
      spanId: 'span-1',
      operationName: 'HTTP GET /api/checkout',
      serviceName: 'frontend',
      startTime: 0,
      duration: 1200,
      status: 'OK',
      depth: 0,
      hasChildren: true,
      tags: [
        { key: 'http.method', value: 'GET' },
        { key: 'http.url', value: '/api/checkout' },
        { key: 'http.status_code', value: '200' },
        { key: 'component', value: 'http-server' }
      ],
      logs: [
        {
          timestamp: 50,
          fields: [
            { key: 'level', value: 'info' },
            { key: 'message', value: 'Processing checkout request' }
          ]
        }
      ]
    },
    {
      spanId: 'span-2',
      operationName: 'validate_cart',
      serviceName: 'cart-service',
      startTime: 25,
      duration: 180,
      status: 'OK',
      depth: 1,
      hasChildren: true,
      parentSpanId: 'span-1',
      tags: [
        { key: 'cart.user_id', value: '12345' },
        { key: 'cart.items_count', value: '3' },
        { key: 'component', value: 'cart-validator' }
      ],
      logs: []
    },
    {
      spanId: 'span-3',
      operationName: 'db.query SELECT * FROM cart_items',
      serviceName: 'database',
      startTime: 35,
      duration: 45,
      status: 'OK',
      depth: 2,
      hasChildren: false,
      parentSpanId: 'span-2',
      tags: [
        { key: 'db.system', value: 'postgresql' },
        { key: 'db.statement', value: 'SELECT * FROM cart_items WHERE user_id = $1' },
        { key: 'db.operation', value: 'SELECT' }
      ],
      logs: []
    },
    {
      spanId: 'span-4',
      operationName: 'inventory_check',
      serviceName: 'inventory-service',
      startTime: 90,
      duration: 95,
      status: 'OK',
      depth: 2,
      hasChildren: true,
      parentSpanId: 'span-2',
      tags: [
        { key: 'inventory.products_checked', value: '3' },
        { key: 'component', value: 'inventory-checker' }
      ],
      logs: []
    },
    {
      spanId: 'span-5',
      operationName: 'redis.get product:123',
      serviceName: 'cache',
      startTime: 95,
      duration: 8,
      status: 'OK',
      depth: 3,
      hasChildren: false,
      parentSpanId: 'span-4',
      tags: [
        { key: 'db.system', value: 'redis' },
        { key: 'db.operation', value: 'GET' },
        { key: 'cache.hit', value: 'true' }
      ],
      logs: []
    },
    {
      spanId: 'span-6',
      operationName: 'redis.get product:456',
      serviceName: 'cache',
      startTime: 110,
      duration: 12,
      status: 'OK',
      depth: 3,
      hasChildren: false,
      parentSpanId: 'span-4',
      tags: [
        { key: 'db.system', value: 'redis' },
        { key: 'db.operation', value: 'GET' },
        { key: 'cache.hit', value: 'false' }
      ],
      logs: []
    },
    {
      spanId: 'span-7',
      operationName: 'db.query SELECT stock FROM products',
      serviceName: 'database',
      startTime: 125,
      duration: 55,
      status: 'OK',
      depth: 3,
      hasChildren: false,
      parentSpanId: 'span-4',
      tags: [
        { key: 'db.system', value: 'postgresql' },
        { key: 'db.statement', value: 'SELECT stock FROM products WHERE id = $1' },
        { key: 'db.operation', value: 'SELECT' }
      ],
      logs: []
    },
    {
      spanId: 'span-8',
      operationName: 'payment_processing',
      serviceName: 'payment-service',
      startTime: 220,
      duration: 850,
      status: 'ERROR',
      depth: 1,
      hasChildren: true,
      parentSpanId: 'span-1',
      tags: [
        { key: 'payment.method', value: 'credit_card' },
        { key: 'payment.amount', value: '129.99' },
        { key: 'payment.currency', value: 'USD' },
        { key: 'error', value: 'true' }
      ],
      logs: [
        {
          timestamp: 680,
          fields: [
            { key: 'level', value: 'error' },
            { key: 'message', value: 'Payment gateway timeout' },
            { key: 'error.type', value: 'TimeoutException' }
          ]
        }
      ]
    },
    {
      spanId: 'span-9',
      operationName: 'stripe.create_payment_intent',
      serviceName: 'payment-gateway',
      startTime: 240,
      duration: 320,
      status: 'OK',
      depth: 2,
      hasChildren: false,
      parentSpanId: 'span-8',
      tags: [
        { key: 'stripe.payment_intent_id', value: 'pi_3abc123' },
        { key: 'component', value: 'stripe-client' }
      ],
      logs: []
    },
    {
      spanId: 'span-10',
      operationName: 'stripe.confirm_payment',
      serviceName: 'payment-gateway',
      startTime: 580,
      duration: 480,
      status: 'ERROR',
      depth: 2,
      hasChildren: true,
      parentSpanId: 'span-8',
      tags: [
        { key: 'stripe.payment_intent_id', value: 'pi_3abc123' },
        { key: 'error', value: 'true' },
        { key: 'component', value: 'stripe-client' }
      ],
      logs: [
        {
          timestamp: 800,
          fields: [
            { key: 'level', value: 'warn' },
            { key: 'message', value: 'Retrying payment confirmation' }
          ]
        }
      ]
    },
    {
      spanId: 'span-11',
      operationName: 'http.request POST /v1/payment_intents/confirm',
      serviceName: 'external-api',
      startTime: 600,
      duration: 420,
      status: 'ERROR',
      depth: 3,
      hasChildren: false,
      parentSpanId: 'span-10',
      tags: [
        { key: 'http.method', value: 'POST' },
        { key: 'http.url', value: 'https://api.stripe.com/v1/payment_intents/pi_3abc123/confirm' },
        { key: 'http.status_code', value: '504' },
        { key: 'error', value: 'true' }
      ],
      logs: [
        {
          timestamp: 1020,
          fields: [
            { key: 'level', value: 'error' },
            { key: 'message', value: 'Gateway timeout from Stripe API' },
            { key: 'http.status_text', value: 'Gateway Timeout' }
          ]
        }
      ]
    },
    {
      spanId: 'span-12',
      operationName: 'order_rollback',
      serviceName: 'order-service',
      startTime: 1080,
      duration: 110,
      status: 'OK',
      depth: 1,
      hasChildren: true,
      parentSpanId: 'span-1',
      tags: [
        { key: 'order.id', value: 'ord_789' },
        { key: 'rollback.reason', value: 'payment_failed' },
        { key: 'component', value: 'order-manager' }
      ],
      logs: [
        {
          timestamp: 1120,
          fields: [
            { key: 'level', value: 'info' },
            { key: 'message', value: 'Rolling back order due to payment failure' }
          ]
        }
      ]
    },
    {
      spanId: 'span-13',
      operationName: 'inventory_restore',
      serviceName: 'inventory-service',
      startTime: 1090,
      duration: 35,
      status: 'OK',
      depth: 2,
      hasChildren: false,
      parentSpanId: 'span-12',
      tags: [
        { key: 'inventory.products_restored', value: '3' },
        { key: 'component', value: 'inventory-restorer' }
      ],
      logs: []
    },
    {
      spanId: 'span-14',
      operationName: 'db.query UPDATE cart_items SET reserved = false',
      serviceName: 'database',
      startTime: 1140,
      duration: 25,
      status: 'OK',
      depth: 2,
      hasChildren: false,
      parentSpanId: 'span-12',
      tags: [
        { key: 'db.system', value: 'postgresql' },
        { key: 'db.statement', value: 'UPDATE cart_items SET reserved = false WHERE order_id = $1' },
        { key: 'db.operation', value: 'UPDATE' }
      ],
      logs: []
    }
    ]
  },
  {
    traceId: '15:27:15-15:27:16',
    endpoint: '/api/products',
    status: 'success',
    startTime: Date.now() - 240000,
    duration: 285,
    spans: [
      {
        spanId: 'prod-1',
        operationName: 'HTTP GET /api/products',
        serviceName: 'frontend',
        startTime: 0,
        duration: 285,
        status: 'OK',
        depth: 0,
        hasChildren: true,
        tags: [
          { key: 'http.method', value: 'GET' },
          { key: 'http.url', value: '/api/products' },
          { key: 'http.status_code', value: '200' }
        ],
        logs: []
      },
      {
        spanId: 'prod-2',
        operationName: 'get_product_catalog',
        serviceName: 'catalog-service',
        startTime: 15,
        duration: 250,
        status: 'OK',
        depth: 1,
        hasChildren: true,
        parentSpanId: 'prod-1',
        tags: [
          { key: 'catalog.category', value: 'electronics' },
          { key: 'catalog.page_size', value: '20' }
        ],
        logs: []
      },
      {
        spanId: 'prod-3',
        operationName: 'redis.get catalog:electronics',
        serviceName: 'cache',
        startTime: 25,
        duration: 5,
        status: 'OK',
        depth: 2,
        hasChildren: false,
        parentSpanId: 'prod-2',
        tags: [
          { key: 'db.system', value: 'redis' },
          { key: 'cache.hit', value: 'true' }
        ],
        logs: []
      },
      {
        spanId: 'prod-4',
        operationName: 'get_product_recommendations',
        serviceName: 'recommendation-service',
        startTime: 40,
        duration: 180,
        status: 'OK',
        depth: 2,
        hasChildren: true,
        parentSpanId: 'prod-2',
        tags: [
          { key: 'ml.model', value: 'collaborative_filtering' },
          { key: 'user.id', value: '12345' }
        ],
        logs: []
      },
      {
        spanId: 'prod-5',
        operationName: 'db.query SELECT * FROM user_preferences',
        serviceName: 'database',
        startTime: 55,
        duration: 35,
        status: 'OK',
        depth: 3,
        hasChildren: false,
        parentSpanId: 'prod-4',
        tags: [
          { key: 'db.system', value: 'postgresql' },
          { key: 'db.statement', value: 'SELECT preferences FROM users WHERE id = $1' }
        ],
        logs: []
      },
      {
        spanId: 'prod-6',
        operationName: 'ml_inference',
        serviceName: 'ml-service',
        startTime: 100,
        duration: 110,
        status: 'OK',
        depth: 3,
        hasChildren: false,
        parentSpanId: 'prod-4',
        tags: [
          { key: 'ml.inference_time', value: '110ms' },
          { key: 'ml.recommendations_count', value: '10' }
        ],
        logs: []
      }
    ]
  },
  {
    traceId: '15:28:45-15:28:47',
    endpoint: '/api/users/profile',
    status: 'success',
    startTime: Date.now() - 180000,
    duration: 450,
    spans: [
      {
        spanId: 'user-1',
        operationName: 'HTTP GET /api/users/profile',
        serviceName: 'frontend',
        startTime: 0,
        duration: 450,
        status: 'OK',
        depth: 0,
        hasChildren: true,
        tags: [
          { key: 'http.method', value: 'GET' },
          { key: 'http.url', value: '/api/users/profile' },
          { key: 'user.id', value: '12345' }
        ],
        logs: []
      },
      {
        spanId: 'user-2',
        operationName: 'authenticate_user',
        serviceName: 'auth-service',
        startTime: 10,
        duration: 95,
        status: 'OK',
        depth: 1,
        hasChildren: true,
        parentSpanId: 'user-1',
        tags: [
          { key: 'auth.method', value: 'jwt' },
          { key: 'auth.user_id', value: '12345' }
        ],
        logs: []
      },
      {
        spanId: 'user-3',
        operationName: 'redis.get session:abc123',
        serviceName: 'cache',
        startTime: 20,
        duration: 8,
        status: 'OK',
        depth: 2,
        hasChildren: false,
        parentSpanId: 'user-2',
        tags: [
          { key: 'db.system', value: 'redis' },
          { key: 'session.id', value: 'abc123' }
        ],
        logs: []
      },
      {
        spanId: 'user-4',
        operationName: 'validate_jwt_token',
        serviceName: 'auth-service',
        startTime: 35,
        duration: 65,
        status: 'OK',
        depth: 2,
        hasChildren: false,
        parentSpanId: 'user-2',
        tags: [
          { key: 'jwt.algorithm', value: 'RS256' },
          { key: 'jwt.expiry_check', value: 'valid' }
        ],
        logs: []
      },
      {
        spanId: 'user-5',
        operationName: 'get_user_profile',
        serviceName: 'user-service',
        startTime: 115,
        duration: 320,
        status: 'OK',
        depth: 1,
        hasChildren: true,
        parentSpanId: 'user-1',
        tags: [
          { key: 'user.id', value: '12345' },
          { key: 'profile.complete', value: 'true' }
        ],
        logs: []
      },
      {
        spanId: 'user-6',
        operationName: 'db.query SELECT * FROM users',
        serviceName: 'database',
        startTime: 125,
        duration: 85,
        status: 'OK',
        depth: 2,
        hasChildren: false,
        parentSpanId: 'user-5',
        tags: [
          { key: 'db.system', value: 'postgresql' },
          { key: 'db.statement', value: 'SELECT * FROM users WHERE id = $1' }
        ],
        logs: []
      },
      {
        spanId: 'user-7',
        operationName: 'get_user_preferences',
        serviceName: 'preferences-service',
        startTime: 220,
        duration: 180,
        status: 'OK',
        depth: 2,
        hasChildren: true,
        parentSpanId: 'user-5',
        tags: [
          { key: 'preferences.categories', value: 'notifications,privacy,display' }
        ],
        logs: []
      },
      {
        spanId: 'user-8',
        operationName: 'db.query SELECT * FROM user_preferences',
        serviceName: 'database',
        startTime: 235,
        duration: 45,
        status: 'OK',
        depth: 3,
        hasChildren: false,
        parentSpanId: 'user-7',
        tags: [
          { key: 'db.system', value: 'postgresql' },
          { key: 'db.statement', value: 'SELECT * FROM user_preferences WHERE user_id = $1' }
        ],
        logs: []
      },
      {
        spanId: 'user-9',
        operationName: 'redis.set user:12345:cache',
        serviceName: 'cache',
        startTime: 290,
        duration: 95,
        status: 'OK',
        depth: 3,
        hasChildren: false,
        parentSpanId: 'user-7',
        tags: [
          { key: 'db.system', value: 'redis' },
          { key: 'cache.ttl', value: '3600' }
        ],
        logs: []
      }
    ]
  },
  {
    traceId: '15:29:22-15:29:25',
    endpoint: '/api/orders/history',
    status: 'timeout',
    startTime: Date.now() - 120000,
    duration: 3000,
    spans: [
      {
        spanId: 'order-1',
        operationName: 'HTTP GET /api/orders/history',
        serviceName: 'frontend',
        startTime: 0,
        duration: 3000,
        status: 'ERROR',
        depth: 0,
        hasChildren: true,
        tags: [
          { key: 'http.method', value: 'GET' },
          { key: 'http.url', value: '/api/orders/history' },
          { key: 'error', value: 'true' }
        ],
        logs: [
          {
            timestamp: 2950,
            fields: [
              { key: 'level', value: 'error' },
              { key: 'message', value: 'Request timeout after 3000ms' }
            ]
          }
        ]
      },
      {
        spanId: 'order-2',
        operationName: 'get_user_orders',
        serviceName: 'order-service',
        startTime: 25,
        duration: 2900,
        status: 'ERROR',
        depth: 1,
        hasChildren: true,
        parentSpanId: 'order-1',
        tags: [
          { key: 'user.id', value: '12345' },
          { key: 'error', value: 'true' }
        ],
        logs: [
          {
            timestamp: 2800,
            fields: [
              { key: 'level', value: 'warn' },
              { key: 'message', value: 'Database query taking longer than expected' }
            ]
          }
        ]
      },
      {
        spanId: 'order-3',
        operationName: 'db.query SELECT * FROM orders',
        serviceName: 'database',
        startTime: 45,
        duration: 2850,
        status: 'ERROR',
        depth: 2,
        hasChildren: false,
        parentSpanId: 'order-2',
        tags: [
          { key: 'db.system', value: 'postgresql' },
          { key: 'db.statement', value: 'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC' },
          { key: 'error', value: 'true' }
        ],
        logs: [
          {
            timestamp: 1000,
            fields: [
              { key: 'level', value: 'info' },
              { key: 'message', value: 'Query execution started' }
            ]
          },
          {
            timestamp: 2895,
            fields: [
              { key: 'level', value: 'error' },
              { key: 'message', value: 'Query timeout - possible lock contention' },
              { key: 'error.type', value: 'QueryTimeoutException' }
            ]
          }
        ]
      },
      {
        spanId: 'order-4',
        operationName: 'redis.get orders:12345:cache',
        serviceName: 'cache',
        startTime: 2950,
        duration: 15,
        status: 'OK',
        depth: 1,
        hasChildren: false,
        parentSpanId: 'order-1',
        tags: [
          { key: 'db.system', value: 'redis' },
          { key: 'cache.hit', value: 'false' }
        ],
        logs: []
      }
    ]
  }
];

// Service colors mapping (similar to Jaeger's color scheme)
const SERVICE_COLORS = {
  'frontend': '#1f77b4',
  'cart-service': '#ff7f0e', 
  'inventory-service': '#2ca02c',
  'database': '#9467bd',
  'cache': '#17becf',
  'payment-service': '#d62728',
  'payment-gateway': '#bcbd22',
  'external-api': '#e377c2',
  'order-service': '#8c564b',
  'catalog-service': '#ff9896',
  'recommendation-service': '#aec7e8',
  'ml-service': '#ffbb78',
  'auth-service': '#98df8a',
  'user-service': '#ff7f0e',
  'preferences-service': '#c5b0d5'
};

interface TracingProps {
  resourceName?: string;
  namespace?: string;
}

const Tracing: React.FC<TracingProps> = ({ resourceName, namespace }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTraceIndex, setSelectedTraceIndex] = useState(0);
  const [expandedSpans, setExpandedSpans] = useState<Set<string>>(new Set(['span-1']));
  const [selectedSpan, setSelectedSpan] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{
    x: number;
    y: number;
    data: {
      time: string;
      service: string;
      endpoint: string;
      duration: string;
      status: 'OK' | 'ERROR';
      spanCount: number;
      intensity: number;
    };
  } | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // Generate persistent heatmap data that doesn't change on re-render
  const heatmapData = useMemo(() => {
    const data: Array<Array<{ intensity: number; hasSpans: boolean; isError: boolean }>> = [];
    
    for (let rowIndex = 0; rowIndex < 5; rowIndex++) {
      const row: Array<{ intensity: number; hasSpans: boolean; isError: boolean }> = [];
      for (let colIndex = 0; colIndex < 120; colIndex++) {
        // Create deterministic "randomness" based on position for consistent data
        const seed = rowIndex * 120 + colIndex;
        const pseudoRandom1 = (Math.sin(seed * 0.1) + 1) / 2;
        const pseudoRandom2 = (Math.sin(seed * 0.7) + 1) / 2;
        const pseudoRandom3 = (Math.sin(seed * 1.3) + 1) / 2;
        
        const intensity = pseudoRandom1;
        const hasSpans = intensity > 0.3;
        const isError = pseudoRandom2 > 0.92;
        
        row.push({ intensity, hasSpans, isError });
      }
      data.push(row);
    }
    
    return data;
  }, []); // Empty dependency array means this will only run once

  // Generate persistent cell data that doesn't change
  const generateCellData = useMemo(() => {
    const services = ['frontend', 'proxy', 'backend', 'database', 'auth-service'];
    const endpoints = [
      '/api/users',
      '/health',
      '/metrics',
      'GET /products',
      'POST /orders',
      '/api/auth/login',
      'GET /cart',
      '/api/checkout'
    ];
    
    const cellDataMap = new Map<string, any>();
    
    for (let rowIndex = 0; rowIndex < 5; rowIndex++) {
      for (let colIndex = 0; colIndex < 120; colIndex++) {
        const seed = rowIndex * 120 + colIndex;
        const serviceSeed = Math.floor((Math.sin(seed * 0.5) + 1) * 0.5 * services.length);
        const endpointSeed = Math.floor((Math.sin(seed * 0.9) + 1) * 0.5 * endpoints.length);
        
        const durations = ['1.77s', '1.46s', '1.15s', '846ms', '538ms'];
        const baseTime = new Date(2024, 0, 1, 15, 25, 0); // 15:25:00
        const timeOffset = (colIndex / 120) * 120000; // 2 minutes total span
        const cellTime = new Date(baseTime.getTime() + timeOffset);
        
        const cellData = heatmapData[rowIndex][colIndex];
        const spanCount = Math.max(1, Math.floor(cellData.intensity * 10));
        
        cellDataMap.set(`${rowIndex}-${colIndex}`, {
          time: cellTime.toLocaleTimeString('en-US', { 
            hour12: false, 
            minute: '2-digit', 
            second: '2-digit',
            fractionalSecondDigits: 3 
          }),
          service: services[serviceSeed],
          endpoint: endpoints[endpointSeed],
          duration: durations[rowIndex],
          status: (cellData.isError ? 'ERROR' : 'OK') as 'OK' | 'ERROR',
          spanCount: spanCount,
          intensity: Math.round(cellData.intensity * 100)
        });
      }
    }
    
    return cellDataMap;
  }, [heatmapData]);

  const currentTrace = MOCK_TRACES[selectedTraceIndex];
  
  const filteredSpans = useMemo(() => {
    return currentTrace.spans.filter(span => {
      const searchMatch = searchQuery === '' || 
        span.operationName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        span.serviceName.toLowerCase().includes(searchQuery.toLowerCase());
      
      return searchMatch;
    });
  }, [searchQuery, currentTrace]);

  const toggleSpanExpanded = (spanId: string) => {
    setExpandedSpans(prev => {
      const newSet = new Set(prev);
      if (newSet.has(spanId)) {
        newSet.delete(spanId);
      } else {
        newSet.add(spanId);
      }
      return newSet;
    });
  };

  const getSpanColor = (serviceName: string) => {
    return SERVICE_COLORS[serviceName as keyof typeof SERVICE_COLORS] || '#666';
  };

  const formatDuration = (duration: number) => {
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(2)}s`;
  };

  const getSpanBarWidth = (duration: number, maxDuration: number) => {
    return Math.max(2, (duration / maxDuration) * 90);
  };

  const getSpanBarOffset = (startTime: number, maxDuration: number) => {
    return (startTime / maxDuration) * 90;
  };

  const handleCellHover = (rowIndex: number, colIndex: number, event: React.MouseEvent) => {
    setMousePosition({ x: event.clientX, y: event.clientY });
    const cellData = generateCellData.get(`${rowIndex}-${colIndex}`);
    if (cellData) {
      setHoveredCell({
        x: colIndex,
        y: rowIndex,
        data: cellData
      });
    }
  };

  const handleCellLeave = () => {
    setHoveredCell(null);
  };


  const renderSpanBar = (span: Span) => {
    const maxDuration = currentTrace.duration;
    const width = getSpanBarWidth(span.duration, maxDuration);
    const offset = getSpanBarOffset(span.startTime, maxDuration);
    const color = getSpanColor(span.serviceName);

    return (
      <div className="relative w-full h-6 flex items-center">
        <div 
          className="absolute h-3 rounded-sm flex items-center"
          style={{
            left: `${offset}%`,
            width: `${width}%`,
            backgroundColor: span.status === 'ERROR' ? '#dc2626' : color,
            opacity: span.status === 'ERROR' ? 0.8 : 0.7
          }}
        >
          {span.status === 'ERROR' && (
            <AlertTriangle className="h-2 w-2 text-white ml-1" />
          )}
        </div>
      </div>
    );
  };

  const renderSpanRows = (spans: Span[], level: number = 0): React.ReactNode[] => {
    const rows: React.ReactNode[] = [];
    
    spans.forEach(span => {
      const isExpanded = expandedSpans.has(span.spanId);
      const isSelected = selectedSpan === span.spanId;
      const hasChildren = span.hasChildren;
      
      // Main span row
      rows.push(
        <TableRow 
          key={span.spanId} 
          className={`cursor-pointer ${
            isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
          }`}
          onClick={() => setSelectedSpan(isSelected ? null : span.spanId)}
        >
          <TableCell className="w-6">
            <div className="flex items-center" style={{ paddingLeft: `${level * 16}px` }}>
              {hasChildren && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSpanExpanded(span.spanId);
                  }}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>
              )}
            </div>
          </TableCell>
          <TableCell className="w-32">
            <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
              {span.serviceName}
            </span>
          </TableCell>
          <TableCell className="flex-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <span className="text-xs font-medium text-gray-900 dark:text-white truncate pr-2">
                  {span.operationName}
                </span>
                {span.status === 'ERROR' && (
                  <AlertTriangle className="h-3 w-3 text-red-500 ml-1" />
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
                <span>{new Date(Date.now() + span.startTime).toLocaleTimeString()}</span>
                <span>{formatDuration(span.duration)}</span>
                <span>Resource</span>
                <span>Root</span>
                <span>Kind</span>
                <span className={span.status === 'ERROR' ? 'text-red-500' : 'text-green-500'}>
                  {span.status}
                </span>
              </div>
            </div>
          </TableCell>
          <TableCell className="w-64">
            {renderSpanBar(span)}
          </TableCell>
        </TableRow>
      );
      
      // Span details row (when selected)
      if (isSelected) {
        rows.push(
          <TableRow key={`${span.spanId}-details`}>
            <TableCell colSpan={4} className="bg-gray-50 dark:bg-gray-800/20">
              <div className="p-4 text-xs">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white mb-2">Tags</h4>
                    {span.tags.length === 0 ? (
                      <p className="text-gray-500">No tags</p>
                    ) : (
                      <div className="space-y-1">
                        {span.tags.map((tag, index) => (
                          <div key={index} className="flex">
                            <span className="font-medium text-gray-700 dark:text-gray-300 w-24 truncate">
                              {tag.key}:
                            </span>
                            <span className="text-gray-600 dark:text-gray-400">
                              {tag.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white mb-2">Logs</h4>
                    {span.logs.length === 0 ? (
                      <p className="text-gray-500">No logs</p>
                    ) : (
                      <div className="space-y-2">
                        {span.logs.map((log, index) => (
                          <div key={index} className="border-l-2 border-blue-500 pl-2">
                            <div className="text-gray-500 mb-1">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </div>
                            {log.fields.map((field, fieldIndex) => (
                              <div key={fieldIndex} className="flex">
                                <span className="font-medium text-gray-700 dark:text-gray-300 w-16">
                                  {field.key}:
                                </span>
                                <span className="text-gray-600 dark:text-gray-400">
                                  {field.value}
                                </span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TableCell>
          </TableRow>
        );
      }
      
      // Render children if expanded
      if (hasChildren && isExpanded) {
        const childSpans = currentTrace.spans.filter(childSpan => childSpan.parentSpanId === span.spanId);
        rows.push(...renderSpanRows(childSpans, level + 1));
      }
    });
    
    return rows;
  };

  return (
    <div className="space-y-4">
      {/* Trace Selector */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-600 dark:text-gray-400">Trace:</span>
        <div className="flex gap-1">
          {MOCK_TRACES.map((trace, index) => (
            <button
              key={trace.traceId}
              onClick={() => {
                setSelectedTraceIndex(index);
                setExpandedSpans(new Set([trace.spans[0]?.spanId]));
                setSelectedSpan(null);
              }}
              className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${
                selectedTraceIndex === index
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <span>{trace.endpoint}</span>
              <div className={`w-2 h-2 rounded-full ${
                trace.status === 'success' ? 'bg-green-500' :
                trace.status === 'error' ? 'bg-red-500' :
                'bg-yellow-500'
              }`}></div>
            </button>
          ))}
        </div>
      </div>

      {/* Header with Stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded"></div>
            <span className="text-gray-600 dark:text-gray-400">OK & UNSET</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded"></div>
            <span className="text-gray-600 dark:text-gray-400">ERROR</span>
          </div>
          <span className="text-gray-600 dark:text-gray-400">
            # of spans: {filteredSpans.length}
          </span>
          <span className="text-gray-600 dark:text-gray-400">
            {formatDuration(currentTrace.duration)} (max)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-500" />
          <span className="text-xs text-gray-600 dark:text-gray-400">
            {currentTrace.traceId}
          </span>
        </div>
      </div>

      {/* Timeline Heatmap Chart */}
      <div className="rounded h-32 relative overflow-hidden">
        {/* Y-axis labels (duration indicators) */}
        <div className="absolute left-1 top-0 h-full flex flex-col justify-between text-xs text-gray-400 py-3 z-10">
          <span>1.77s</span>
          <span>1.46s</span>
          <span>1.15s</span>
          <span>846ms</span>
          <span>538ms</span>
        </div>
        
        {/* Heatmap Rows */}
        <div className="absolute left-12 top-3 right-4 bottom-6 flex flex-col justify-between">
          {heatmapData.map((row, rowIndex) => (
            <div key={rowIndex} className="flex h-4 items-center gap-px">
              {row.map((cell, colIndex) => {
                const { intensity, hasSpans, isError } = cell;
                const opacity = hasSpans ? Math.min(intensity * 0.7 + 0.3, 1) : 0;
                
                return (
                  <div
                    key={colIndex}
                    className={`h-3 cursor-pointer hover:brightness-110 transition-all ${
                      !hasSpans 
                        ? 'bg-transparent hover:bg-slate-600/20' 
                        : isError 
                          ? 'bg-blue-600 hover:bg-blue-400' 
                          : intensity > 0.7
                            ? 'bg-blue-500 hover:bg-blue-400'
                            : intensity > 0.5
                              ? 'bg-blue-400/60 hover:bg-blue-300'
                              : 'bg-slate-400/30 hover:bg-slate-300'
                    }`}
                    style={{ 
                      opacity: hasSpans ? opacity : 0,
                      width: 'calc(100% / 120)',
                      minWidth: '1px'
                    }}
                    onMouseEnter={(e) => hasSpans && handleCellHover(rowIndex, colIndex, e)}
                    onMouseLeave={handleCellLeave}
                  />
                );
              })}
            </div>
          ))}
        </div>
        
        {/* Time range selector overlay */}
        <div className="absolute top-2 right-2 bg-gray-800 text-white px-2 py-1 rounded text-xs z-10">
          Set timerange & duration filter
        </div>

        {/* Time axis labels */}
        <div className="absolute bottom-1 left-12 right-4 flex justify-between text-xs text-gray-400">
          <span>15:25</span>
          <span>15:25</span>
          <span>15:25</span>
          <span>15:26</span>
          <span>15:26</span>
          <span>15:26</span>
          <span>15:26</span>
        </div>
      </div>

      {/* Tooltip */}
      {hoveredCell && (
        <div
          className="fixed z-50 bg-slate-800 border border-slate-600 text-white px-3 py-2 rounded-lg shadow-xl text-xs pointer-events-none backdrop-blur-sm"
          style={{
            left: mousePosition.x + 12,
            top: mousePosition.y - 12,
            transform: mousePosition.x > window.innerWidth - 250 ? 'translateX(-100%)' : 'translateX(0)',
          }}
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${
                  hoveredCell.data.status === 'ERROR' ? 'bg-red-400' : 'bg-blue-400'
                }`}></div>
                <span className="font-semibold text-white">{hoveredCell.data.status}</span>
              </div>
              <div className="text-slate-300 text-xs">
                {hoveredCell.data.spanCount} span{hoveredCell.data.spanCount > 1 ? 's' : ''}
              </div>
            </div>
            <hr className="border-slate-600" />
            <div><span className="text-slate-400">Time:</span> <span className="text-blue-200">{hoveredCell.data.time}</span></div>
            <div><span className="text-slate-400">Service:</span> <span className="text-white font-medium">{hoveredCell.data.service}</span></div>
            <div><span className="text-slate-400">Endpoint:</span> <span className="text-blue-200">{hoveredCell.data.endpoint}</span></div>
            <div><span className="text-slate-400">Duration:</span> <span className="text-blue-200">{hoveredCell.data.duration}</span></div>
            <div><span className="text-slate-400">Intensity:</span> <span className="text-slate-200">{hoveredCell.data.intensity}%</span></div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search spans..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-8 h-8"
        />
      </div>

      {/* Spans Table */}
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-100 dark:bg-gray-800/40">
            <TableHead className="w-6"></TableHead>
            <TableHead className="w-32">Attributes</TableHead>
            <TableHead className="flex-1">
              <div className="flex items-center justify-between">
                <span>Name</span>
                {/* <div className="flex items-center gap-4 mr-4 text-xs">
                  <span>Start time</span>
                  <span>Duration</span>
                  <span>Resource</span>
                  <span>Root</span>
                  <span>Kind</span>
                  <span>Spans by status code</span>
                </div> */}
              </div>
            </TableHead>
            <TableHead className="w-64 text-center">Timeline</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {renderSpanRows(filteredSpans.filter(span => span.depth === 0))}
        </TableBody>
      </Table>

      {/* Stats Summary */}
      <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 pt-2">
        <div className="flex items-center gap-4">
          <span>OK & UNSET: {filteredSpans.filter(span => span.status === 'OK').length}</span>
          <span>ERROR: {filteredSpans.filter(span => span.status === 'ERROR').length}</span>
          <span>Total: {filteredSpans.length}</span>
        </div>
      </div>
    </div>
  );
};

export default Tracing;