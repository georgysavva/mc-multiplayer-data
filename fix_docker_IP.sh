sudo cp /etc/docker/daemon.json /etc/docker/daemon.json.bak.$(date +%s)

sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{
  "bip": "169.254.123.1/24",
  "default-address-pools": [
    { "base": "172.80.0.0/16", "size": 24 }
  ]
}
EOF

sudo systemctl restart docker 