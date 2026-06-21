FROM daptin/daptin:v0.12.22

WORKDIR /opt/daptin

COPY deploy/daptin/entrypoint.sh /opt/canaster/entrypoint.sh

RUN mkdir -p /opt/canaster/schema && chmod +x /opt/canaster/entrypoint.sh

COPY daptin/schema_*.yaml /opt/canaster/schema/

ENV DAPTIN_SCHEMA_FOLDER=/opt/canaster/schema
ENV DAPTIN_LOCAL_STORAGE_PATH=/data/storage
ENV DAPTIN_STORAGE=/data/storage

ENTRYPOINT ["/opt/canaster/entrypoint.sh"]
