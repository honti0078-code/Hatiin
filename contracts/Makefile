# SplitEscrow — build / test / optimize (Rust 1.89.0 + Stellar CLI v27)
WASM = target/wasm32-unknown-unknown/release/split_escrow.wasm

default: build
build:
	cd split-escrow && cargo +1.89.0 build --release --target wasm32-unknown-unknown
	@ls -lh $(WASM)
test:
	cd split-escrow && cargo +1.89.0 test
optimize: build
	stellar contract optimize --wasm $(WASM)
clean:
	cd split-escrow && cargo clean
.PHONY: default build test optimize clean
