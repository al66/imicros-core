# imicros-core
![NpmLicense](https://img.shields.io/npm/l/imicros-minio.svg)
![npm](https://img.shields.io/npm/v/imicros-minio.svg)

Basic services for imicros-backend:
 *  authentification &amp; authorization services for imicros-backend
 *  object store
 *  execution of business rules based on DMNN
 *  execution of business processes defined in BPMN
 *  service for rendering html templates
 *  notification service for data exchange between groups
 *  external mail service with SMTP

## Dependencies
All services are realized with the [Moleculer](https://github.com/moleculerjs/moleculer) framework.   
As key value store for core objects [Cassandra](https://cassandra.apache.org/) is used.  
The communication between the services is routet via [NATS](https://nats.io/).  
[Minio](https://min.io/) is used as a central object store for user content.  

## History
Replacement of single packages (Neo4j replaced by cassandra)
  * imicros-auth
  * imicros-users
  * imicros-groups
  * imicros-agents
  * imicros-acl
  * imicros-keys
  * imicros-minio
  * imicros-mail
  * imicros-feel
  * imicros-templates
  * imicros-gateway
  * imicros-flow-map

Still open:
  * imicros-flow
  * imicros-exchange

## Services
### <u>Map</u>
Service for transformation JSON to JSON with [JSONata](https://docs.jsonata.org/overview.html)

#### Actions
- map { name, data } => result  
- map { template, data } => result  

### <u>Feel</u>
Service for FEEL and DMN evaluation
### Actions
- evalute { expression, context } => any  
- convert { xml } => { result(true|false), error?, expression }
- check { expression } => { result(true|false), error? }  
- clearFromCache { objectName } => { done } 