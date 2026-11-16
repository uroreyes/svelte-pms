# Reverse proxy with the site config baked in (no bind mounts needed at deploy time).
#   docker build -t hotel-pms/nginx docker/nginx
FROM nginx:1.27-alpine
COPY default.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
