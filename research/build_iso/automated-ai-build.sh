#!/bin/bash
# automated-ai-build.sh

echo "🚀 Starting AI-Embedded ISO Build Process..."

# 1. Clone official pi-gen if not exists
if [ ! -d "pi-gen" ]; then
    git clone --depth 1 https://github.com/RPi-Distro/pi-gen.git
fi
cd pi-gen

# 2. Create Stage 6 (Our AI Customizations)
mkdir -p stage6/00-install-packages
mkdir -p stage6/01-inject-ai-assets

# 3. Define packages
echo "python3-psutil python3-pip libcamera-apps cmake g++ git zram-tools" > stage6/00-install-packages/00-packages

# 4. Define injection logic
cat <<EOF > stage6/01-inject-ai-assets/00-run.sh
#!/bin/bash -e
echo "🛠️ Compiling llama.cpp and injecting AI scripts..."

# Build llama.cpp for ARM64
git clone --depth 1 https://github.com/ggerganov/llama.cpp /opt/llama.cpp
cd /opt/llama.cpp
cmake -B build -DLLAMA_NEON=ON
cmake --build build --config Release -j4

# Inject AI Scripts
install -m 755 /build/assets/ai-probe.py /usr/local/bin/ai-probe
install -m 755 /build/assets/vision-bridge.py /usr/local/bin/vision-bridge

# Pre-download Qwen-1.5B Model
curl -L https://huggingface.co/Qwen/Qwen2-1.5B-Instruct-GGUF/resolve/main/qwen2-1.5b-instruct-q4_k_m.gguf -o /opt/model.gguf

echo "✅ AI Injection Complete!"
EOF

chmod +x stage6/01-inject-ai-assets/00-run.sh

# 5. Run the Docker-based build
echo "🐳 Launching Docker build. This will take some time..."
./build-docker.sh
