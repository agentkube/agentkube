const WebSocket = require('ws');

// Configuration
const config = {
    baseUrl: 'ws://localhost:4688',
    clusterName: 'kind-black-dinosaurs',
    userId: 'test-user-123'
};

// Test WebSocket connections to different endpoints
const testEndpoints = [
    '/ws',
    '/wsMultiplexer', 
    `/api/v1/socket/clusters/${config.clusterName}/ws`,
    `/api/v1/socket/clusters/${config.clusterName}/watch`
];

// Sample test messages
const testMessages = {
    // Basic connection test
    connection: {
        clusterId: config.clusterName,
        userId: config.userId,
        path: '/api/v1/pods',
        query: 'watch=true',
        type: 'REQUEST',
        data: ''
    },
    
    // Watch pods in all namespaces
    watchPods: {
        clusterId: config.clusterName,
        userId: config.userId,
        path: '/api/v1/pods',
        query: 'watch=true',
        type: 'REQUEST',
        data: ''
    },
    
    // Watch all namespaces
    watchNamespaces: {
        clusterId: config.clusterName,
        userId: config.userId,
        path: '/api/v1/namespaces',
        query: 'watch=true',
        type: 'REQUEST',
        data: ''
    },
    
    // Close connection
    close: {
        clusterId: config.clusterName,
        userId: config.userId,
        path: '/api/v1/pods',
        query: '',
        type: 'CLOSE',
        data: ''
    }
};

// Helper function to test a single WebSocket endpoint
function testWebSocketEndpoint(endpoint, testName) {
    return new Promise((resolve, reject) => {
        console.log(`\n>� Testing ${testName}: ${endpoint}`);
        
        const wsUrl = config.baseUrl + endpoint;
        const ws = new WebSocket(wsUrl);
        
        let messageCount = 0;
        const timeout = setTimeout(() => {
            ws.close();
            resolve({
                endpoint,
                testName,
                status: 'timeout',
                messages: messageCount,
                error: 'Connection timeout after 10 seconds'
            });
        }, 10000);
        
        ws.on('open', () => {
            console.log(` Connected to ${endpoint}`);
            
            // Send a test message based on endpoint
            let testMessage;
            if (endpoint.includes('/wsMultiplexer') || endpoint.includes('/socket/clusters/')) {
                testMessage = testMessages.watchPods;
                console.log(`=� Sending message:`, JSON.stringify(testMessage, null, 2));
                ws.send(JSON.stringify(testMessage));
            } else {
                // For basic /ws endpoint, just keep connection open
                console.log(`=� Connection established, listening...`);
            }
        });
        
        ws.on('message', (data) => {
            messageCount++;
            try {
                const message = JSON.parse(data);
                // Extract and display Kubernetes data like Headlamp
                if (message.type === 'DATA' && message.data) {
                    try {
                        const kubernetesEvent = JSON.parse(message.data);
                        console.log(`\n📦 Kubernetes Event ${messageCount}:`);
                        console.log(`   Type: ${kubernetesEvent.type}`);
                        console.log(`   Resource: ${kubernetesEvent.object?.kind}/${kubernetesEvent.object?.metadata?.name}`);
                        console.log(`   Namespace: ${kubernetesEvent.object?.metadata?.namespace || 'cluster-wide'}`);
                        console.log(`   Resource Version: ${kubernetesEvent.object?.metadata?.resourceVersion}`);
                        
                        // Show the raw Kubernetes event data (like Headlamp DevTools)
                        console.log(`\n📋 Raw Kubernetes Event Data:`);
                        console.log(JSON.stringify(kubernetesEvent, null, 2));
                        console.log('\n' + '='.repeat(80));
                        
                    } catch (parseError) {
                        console.log(`📥 DATA Message ${messageCount} - Length: ${message.data.length}`);
                        console.log(`   Raw data: ${message.data.substring(0, 500)}...`);
                    }
                } else {
                    // Show non-data messages (STATUS, COMPLETE, etc.)
                    console.log(`📥 ${message.type} Message ${messageCount}:`, {
                        clusterId: message.clusterId,
                        path: message.path,
                        data: message.type === 'STATUS' ? JSON.parse(message.data || '{}') : (message.data ? `${message.data.length} chars` : 'empty')
                    });
                }
            } catch (e) {
                console.log(`=� Raw message ${messageCount}:`, data.toString().substring(0, 200));
            }
        });
        
        ws.on('error', (error) => {
            console.log(`L WebSocket error: ${error.message}`);
            clearTimeout(timeout);
            resolve({
                endpoint,
                testName,
                status: 'error',
                messages: messageCount,
                error: error.message
            });
        });
        
        ws.on('close', (code, reason) => {
            console.log(`= Connection closed: ${code} ${reason}`);
            clearTimeout(timeout);
            resolve({
                endpoint,
                testName,
                status: 'closed',
                messages: messageCount,
                closeCode: code,
                closeReason: reason.toString()
            });
        });
        
        // Close connection after getting some messages or timeout
        setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
                console.log(`� Closing connection after 8 seconds...`);
                ws.close();
            }
        }, 100000);
    });
}

// Main test function
async function runTests() {
    console.log(`=� Starting WebSocket tests for operator-api`);
    console.log(`=�  Server: ${config.baseUrl}`);
    console.log(`<� Cluster: ${config.clusterName}`);
    console.log(`=d User: ${config.userId}`);
    
    const results = [];
    
    // Test each endpoint
    for (const endpoint of testEndpoints) {
        const testName = endpoint.split('/').pop() || 'root';
        try {
            const result = await testWebSocketEndpoint(endpoint, testName);
            results.push(result);
        } catch (error) {
            results.push({
                endpoint,
                testName,
                status: 'failed',
                error: error.message
            });
        }
        
        // Wait between tests
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Print summary
    console.log(`\n=� TEST RESULTS SUMMARY`);
    console.log(`========================`);
    
    results.forEach((result, index) => {
        const status = result.status === 'closed' && result.messages > 0 ? ' SUCCESS' : 
                      result.status === 'error' ? 'L FAILED' : 
                      result.status === 'timeout' ? '� TIMEOUT' : '�  UNKNOWN';
        
        console.log(`${index + 1}. ${result.testName}: ${status}`);
        console.log(`   Endpoint: ${result.endpoint}`);
        console.log(`   Messages: ${result.messages}`);
        if (result.error) {
            console.log(`   Error: ${result.error}`);
        }
        console.log('');
    });
    
    const successful = results.filter(r => r.status === 'closed' && r.messages > 0).length;
    console.log(`( Overall: ${successful}/${results.length} tests successful`);
}

// Test authentication patterns (bonus test)
async function testAuthenticationMethods() {
    console.log(`\n= Testing Authentication Methods`);
    console.log(`=================================`);
    
    const authTests = [
        {
            name: 'Token in Message',
            message: {
                ...testMessages.watchPods,
                token: 'test-token-123'
            }
        },
        {
            name: 'No Token (Cookie/Header fallback)',
            message: testMessages.watchPods
        }
    ];
    
    for (const authTest of authTests) {
        console.log(`\n>� Testing: ${authTest.name}`);
        
        const ws = new WebSocket(`${config.baseUrl}/wsMultiplexer`);
        
        await new Promise((resolve) => {
            ws.on('open', () => {
                console.log(`=� Sending auth test message`);
                ws.send(JSON.stringify(authTest.message));
            });
            
            let messageCount = 0;
            ws.on('message', (data) => {
                messageCount++;
                if (messageCount === 1) {
                    try {
                        const message = JSON.parse(data);
                        console.log(`=� Response type: ${message.type}`);
                        if (message.type === 'STATUS') {
                            console.log(`=� Status: ${JSON.parse(message.data).state}`);
                        }
                    } catch (e) {
                        console.log(`=� Raw response: ${data.toString().substring(0, 100)}`);
                    }
                }
            });
            
            ws.on('error', (error) => {
                console.log(`L Auth test error: ${error.message}`);
            });
            
            setTimeout(() => {
                ws.close();
                resolve();
            }, 30000);
        });
    }
}

// Simple Kubernetes event watcher (like Headlamp)
async function watchKubernetesEvents() {
    console.log(`\n🎯 Kubernetes Event Watcher (Headlamp Style)`);
    console.log(`==============================================`);
    console.log(`🔗 Connecting to: ws://localhost:4688/api/v1/socket/clusters/kind-black-dinosaurs/ws`);
    console.log(`👁️  Watching: /api/v1/pods (watch=true) - ALL NAMESPACES`);
    
    const ws = new WebSocket(`${config.baseUrl}/api/v1/socket/clusters/${config.clusterName}/ws`);
    
    return new Promise((resolve) => {
        ws.on('open', () => {
            console.log(`✅ Connected! Sending watch request...`);
            
            const watchMessage = {
                clusterId: config.clusterName,
                userId: config.userId,
                path: '/api/v1/pods',
                query: 'watch=true',
                type: 'REQUEST',
                data: ''
            };
            
            ws.send(JSON.stringify(watchMessage));
        });
        
        let eventCount = 0;
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                
                if (message.type === 'DATA' && message.data) {
                    eventCount++;
                    const kubernetesEvent = JSON.parse(message.data);
                    
                    // Display exactly like Headlamp DevTools
                    console.log(`\n🚀 Event #${eventCount} - ${kubernetesEvent.type}`);
                    console.log(`📊 Data Length: ${message.data.length} bytes`);
                    console.log(`📋 Kubernetes Watch Event:`);
                    console.log(kubernetesEvent);
                    
                } else if (message.type === 'STATUS') {
                    const status = JSON.parse(message.data || '{}');
                    console.log(`🔄 Connection Status: ${status.state}`);
                } else if (message.type === 'COMPLETE') {
                    console.log(`✨ Resource version update complete`);
                }
                
            } catch (e) {
                console.log(`⚠️  Parse error:`, e.message);
            }
        });
        
        ws.on('error', (error) => {
            console.log(`❌ WebSocket error: ${error.message}`);
        });
        
        // Watch for 15 seconds
        setTimeout(() => {
            console.log(`\n⏰ Stopping watch after 15 seconds (received ${eventCount} events)`);
            ws.close();
            resolve();
        }, 145000);
    });
}

// Run all tests
async function main() {
    try {
        // Run the Kubernetes event watcher (like Headlamp)
        await watchKubernetesEvents();
        console.log(`\n<� All tests completed!`);
    } catch (error) {
        console.error(`=� Test suite failed:`, error);
    }
    
    process.exit(0);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n=K Tests interrupted by user');
    process.exit(0);
});

main();