const test = {
    id: '4022fb03-aa8f-4dd8-99ed-a2775559e305',
    nodeID: 'node-1',
    action: { name: 'v1.groups.isAuthorized' },
    service: { name: 'groups', version: 'v1', fullName: 'v1.groups' },
    options: { 
        parentCtx: { 
            id: '20816d3a-17a7-40d2-8a19-0e2de22df20e', 
            nodeID: 'node-1', 
            action: { name: 'v1.templates.render' }, 
            service: { name: 'templates', version: 'v1', fullName: 'v1.templates' }, 
            options: { 
                meta: { 
                    acl: [Object] 
                }, 
                retries: 3, 
                timeout: 0 
            }, 
            parentID: null, 
            caller: null, 
            level: 1, 
            params: { 
                template: 'workflow/templates/User Confirmation Subject en-US.json', 
                data: { email: 'max.mustermann@company.com', locale: 'en-US', confirmationToken: 'anyConfirmationToken' } 
            }, 
            meta: { 
                acl: { 
                    accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjI5NWQzYWIzLWRhZjItNGZlYS04YmM5LWQxMjQxN2FlNzYzNSJ9.eyJ0eXBlIjoiYWNjZXNzVG9rZW5JbnRlcm5hbCIsIm5vZGVJRCI6Im5vZGUtMSIsImdyb3VwSWQiOiI4ZDdhYTg0MC04OWM1LTRkODMtOThkNi0yYjJiM2U3Yjg5MTQiLCJhZG1pbkdyb3VwIjp0cnVlLCJ1c2VySWQiOm51bGwsImFnZW50SWQiOm51bGwsInVzZXIiOm51bGwsImFnZW50IjpudWxsLCJyb2xlIjpudWxsLCJzZXJ2aWNlIjoiNmNlODc2M2QtMzk2MC00Y2E5LWI0YWItMDVkYWY2Mjc4ODQ0IiwiaWF0IjoxNzE4NTI4MzY3fQ.0IyvLnAmoWFx9BwFP-aR_o5rEpxuxQggU8NTMkaWEHA' 
                } 
            }, 
            requestID: '20816d3a-17a7-40d2-8a19-0e2de22df20e', 
            tracing: null, 
            span: null, 
            needAck: null, 
            ackID: null, 
            eventName: null, 
            eventType: null, 
            eventGroups: null, 
            cachedResult: false 
        }, 
        timeout: 0 
    }, 
    parentID: '20816d3a-17a7-40d2-8a19-0e2de22df20e', 
    caller: 'v1.templates', 
    level: 2, 
    params: { 
        action: { 
            acl: [Object], 
            params: [Object], 
            handler: [Function(anonymous)], 
            rawName: 'render', 
            name: 'v1.templates.render', 
            service: [Service] 
        }, 
        ctx: { 
            id: '20816d3a-17a7-40d2-8a19-0e2de22df20e', 
            nodeID: 'node-1', 
            action: { 
                name: 'v1.templates.render' 
            }, 
            service: { name: 'templates', version: 'v1', fullName: 'v1.templates' }, 
            options: { 
                meta: { 
                    acl: [Object] }, 
                    retries: 3, 
                    timeout: 0 }, 
                    parentID: null, 
                    caller: null, 
                    level: 1, 
                    params: { 
                        template: 'workflow/templates/User Confirmation Subject en-US.json', 
                        data: { email: 'max.mustermann@company.com', locale: 'en-US', confirmationToken: 'anyConfirmationToken' } 
                    }, 
                    meta: { 
                        acl: { 
                            accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjI5NWQzYWIzLWRhZjItNGZlYS04YmM5LWQxMjQxN2FlNzYzNSJ9.eyJ0eXBlIjoiYWNjZXNzVG9rZW5JbnRlcm5hbCIsIm5vZGVJRCI6Im5vZGUtMSIsImdyb3VwSWQiOiI4ZDdhYTg0MC04OWM1LTRkODMtOThkNi0yYjJiM2U3Yjg5MTQiLCJhZG1pbkdyb3VwIjp0cnVlLCJ1c2VySWQiOm51bGwsImFnZW50SWQiOm51bGwsInVzZXIiOm51bGwsImFnZW50IjpudWxsLCJyb2xlIjpudWxsLCJzZXJ2aWNlIjoiNmNlODc2M2QtMzk2MC00Y2E5LWI0YWItMDVkYWY2Mjc4ODQ0IiwiaWF0IjoxNzE4NTI4MzY3fQ.0IyvLnAmoWFx9BwFP-aR_o5rEpxuxQggU8NTMkaWEHA' 
                        } 
                    }, 
                    requestID: '20816d3a-17a7-40d2-8a19-0e2de22df20e', 
                    tracing: null, 
                    span: null, 
                    needAck: null, 
                    ackID: null, 
                    eventName: null, 
                    eventType: null, 
                    eventGroups: null, 
                    cachedResult: false 
                }, 
                abort: true 
            }, 
            meta: {}, 
            requestID: '20816d3a-17a7-40d2-8a19-0e2de22df20e', tracing: null, span: null, needAck: null, ackID: null, eventName: null, eventType: null, eventGroups: null, cachedResult: false
        },
        abort: true 
    }, 
    meta: {}, 
    requestID: '20816d3a-17a7-40d2-8a19-0e2de22df20e', tracing: null, span: null, needAck: null, ackID: null, eventName: null, eventType: null, eventGroups: null, cachedResult: false } }
}