FROM daptin/daptin@sha256:da432637f648ab5e5e60a4b226a45a447c03d677f06ede0f9b7c0f63b3f6d7d6

WORKDIR /opt/daptin

COPY deploy/daptin/entrypoint.sh /opt/canaster/entrypoint.sh

RUN mkdir -p /opt/canaster/schema && chmod +x /opt/canaster/entrypoint.sh

COPY daptin/schema_*.yaml /opt/canaster/schema/

ENV DAPTIN_SCHEMA_FOLDER=/opt/canaster/schema
ENV DAPTIN_LOCAL_STORAGE_PATH=/data/storage
ENV DAPTIN_STORAGE=/data/storage

ENTRYPOINT ["/opt/canaster/entrypoint.sh"]
