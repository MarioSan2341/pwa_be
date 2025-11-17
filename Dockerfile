# Imagen oficial de Node
FROM node:18

# Establecer carpeta de trabajo dentro del contenedor
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código del proyecto
COPY . .

# Exponer el puerto (ajústalo si tu server.js usa otro)
EXPOSE 5000

# Comando para iniciar la app
CMD ["node", "server.js"]
