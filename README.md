# Library Project - Book Search API

API Serverless para búsqueda de libros utilizando AWS Lambda, Amazon S3 y Amazon DynamoDB.

## Arquitectura

- **Runtime**: Node.js 24.x en ARM64
- **API**: HTTP API Gateway (v2)
- **Almacenamiento**:
  - **Amazon S3**: Almacenamiento de catálogos e índices de libros.
  - **Amazon DynamoDB**: Almacenamiento de metadatos de libros (ISBN, título, etc.).
- **Infraestructura**: AWS SAM (Serverless Application Model)

## Requisitos Previos

- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) instalado.
- [Node.js 24.x](https://nodejs.org/) instalado.
- **AWS CLI** configurado con tus credenciales (`aws configure`).
- **Docker** (opcional, recomendado para pruebas locales más fieles).

## Estructura del Proyecto

```
booking-project/
├── services/
│   └── sls-get-books/
│       ├── handler.js          # Código de la función Lambda
│       └── package.json        # Dependencias de la función
├── template.yaml               # Plantilla de infraestructura AWS SAM
├── samconfig.toml              # Configuración de despliegue por entorno
├── env.json                    # Variables de entorno para pruebas locales
├── package.json                # Scripts del proyecto
└── scripts/
    ├── book-indexer/           # Utilidad en Go para indexar libros
    └── sitemap-scraper/        # Scraper Playwright para obtener datos de libros
```

## Utilidades y Scripts Adicionales

El proyecto incluye herramientas auxiliares en la carpeta `scripts/`:

### 1. Book Indexer (`scripts/book-indexer`)
Herramienta escrita en **Go** (`main.go`).
- **Propósito**: Indexar información de libros (probablemente procesando datos para S3/DynamoDB).
- **Ejecución**: Requiere Go instalado.

### 2. Sitemap Scraper (`scripts/sitemap-scraper`)
Proyecto en **TypeScript/Playwright**.
- **Propósito**: Scraper automatizado para extraer información de libros desde fuentes web.
- **Configuración**: Ver `package.json` y `playwright.config.ts` dentro del directorio.

## Instalación

1.  Instalar dependencias del proyecto raíz:
    ```bash
    npm install
    ```

2.  Instalar dependencias de la función Lambda:
    ```bash
    cd services/sls-get-books
    npm install
    cd ../..
    ```

## Desarrollo Local

### 1. Validar la plantilla
Verifica que `template.yaml` sea válido:
```bash
npm run sam:validate
```

### 2. Construir la aplicación
Compila el código, instala dependencias y prepara los artefactos:
```bash
npm run sam:build
```

### 3. Ejecutar API en local
Levanta un servidor local en el puerto 3000 que simula API Gateway y Lambda:
```bash
npm run sam:local
```

> **Nota:** El comando `npm run sam:local` ya incluye la configuración necesaria (`--env-vars env.json` y parámetros) para conectarse correctamente a los recursos en AWS (como S3) desde tu entorno local.

Prueba el endpoint:
```bash
curl "http://localhost:3000/?s=harry+potter"
```

## Despliegue

El proyecto tiene configuraciones para 3 entornos: **dev**, **qa** y **prod**.

### Desplegar a Desarrollo (Dev)
```bash
npm run sam:deploy:dev
```

### Desplegar a QA
```bash
npm run sam:deploy:qa
```

### Desplegar a Producción (Prod)
```bash
npm run sam:deploy:prod
```

## Configuración de Entornos

Cada entorno tiene su propia configuración definida en `samconfig.toml`:

| Entorno | Stack Name | Bucket S3 | Tabla DynamoDB | Log Level |
|---------|-----------|-----------|----------------|-----------|
| **dev** | library-project-dev | library-store-bucket | table-books-dev | debug |
| **qa** | library-project-qa | mi-bucket-app-qa | table-books-qa | info |
| **prod** | library-project-prod | mi-bucket-app-oficial | table-books-prod | error |

## Scripts Disponibles

## Scripts Disponibles

Estos son los scripts definidos en `package.json` para facilitar el uso de SAM CLI:

```json
"scripts": {
  "sam:build": "sam build",
  "sam:local": "sam local start-api --env-vars env.json --parameter-overrides 'ParameterKey=Environment,ParameterValue=dev ParameterKey=BucketName,ParameterValue=library-store-bucket'\"",
  "sam:deploy:dev": "sam deploy --config-env dev",
  "sam:deploy:qa": "sam deploy --config-env qa",
  "sam:deploy:prod": "sam deploy --config-env prod",
  "sam:validate": "sam validate",
  "sam:logs": "sam logs --stack-name library-project-dev --tail"
}
```

**Descripción:**
- **`sam:build`**: Compila y prepara los artefactos de la función Lambda.
- **`sam:local`**: Inicia la API localmente, inyectando las variables de entorno desde `env.json` y configurando el bucket correcto.
- **`sam:deploy:*`**: Despliega la aplicación al entorno especificado (dev, qa, prod) usando la configuración de `samconfig.toml`.
- **`sam:validate`**: Verifica la sintaxis del archivo `template.yaml`.
- **`sam:logs`**: Muestra los logs de la función Lambda en tiempo real (por defecto para el entorno dev).

## Solución de Problemas

### Error de credenciales o bucket
Si al correr en local recibes errores de acceso a S3, asegúrate de:
1. Tener tus credenciales configuradas correctamente (`aws configure`).
2. Que tu usuario tenga permisos de lectura en el bucket especificado en `env.json`.

### Error "sam no se reconoce"
Asegúrate de haber instalado AWS SAM CLI y que su ruta esté en las variables de entorno, o usa los scripts de `npm` que ya tienen la ruta configurada (ver `package.json`).
