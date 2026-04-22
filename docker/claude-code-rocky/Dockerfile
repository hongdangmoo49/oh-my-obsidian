FROM rockylinux:9.3.20231119-minimal

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG NODE_MAJOR=24

RUN microdnf install -y \
        bash \
        ca-certificates \
        curl \
        findutils \
        git \
        gzip \
        jq \
        less \
        openssh-clients \
        procps-ng \
        tar \
        unzip \
        which \
        xz \
        zsh \
    && curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash - \
    && microdnf install -y nodejs \
    && microdnf clean all

ENV PATH="/root/.local/bin:${PATH}"

RUN git config --system --add safe.directory /workspace/oh-my-obsidian

WORKDIR /workspace/oh-my-obsidian

CMD ["/bin/bash", "-lc", "sleep infinity"]
