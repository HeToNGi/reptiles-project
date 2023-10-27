#!/bin/bash

# 开发环境

service_name="reptiles-project"
service_version="1.0"


docker stop ${service_name}

docker rm ${service_name}

docker rmi ${service_name}:${service_version}

docker build -t ${service_name}:${service_version} .

docker run -i --init -d -t --cap-add=SYS_ADMIN --name ${service_name} ${service_name}:${service_version}
