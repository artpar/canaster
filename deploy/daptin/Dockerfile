FROM daptin/daptin:v0.12.17

WORKDIR /opt/daptin

COPY daptin/schema_canaster.yaml /opt/canaster/schema/schema_canaster.yaml
COPY deploy/daptin/entrypoint.sh /opt/canaster/entrypoint.sh

RUN chmod +x /opt/canaster/entrypoint.sh

ENV DAPTIN_SCHEMA_FOLDER=/opt/canaster/schema
ENV DAPTIN_LOCAL_STORAGE_PATH=/data/storage
ENV DAPTIN_STORAGE=/data/storage

ENTRYPOINT ["/opt/canaster/entrypoint.sh"]
