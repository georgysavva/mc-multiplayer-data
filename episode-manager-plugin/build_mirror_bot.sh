docker run --rm -v "$(pwd)":/app -w /app maven:3.9-eclipse-temurin-21 mvn clean package
cp target/MirrorBot-1.0.jar ../plugins
