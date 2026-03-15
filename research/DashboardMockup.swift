import SwiftUI

struct PrometheusDashboard: View {
    @State private var activeTab = "Console"
    @State private var ramUsage = 0.94 // 15GB/16GB
    @State private var isSidebarVisible = true
    @State private var isRightPanelVisible = true
    @State private var thinkingText = "Researching native bridge implementation using Unix Domain Sockets..."
    
    var body: some View {
        NavigationSplitView {
            if isSidebarVisible {
                List(selection: $activeTab) {
                    Label("Console", systemImage: "terminal").tag("Console")
                    Label("Project Plan", systemImage: "list.bullet.indent").tag("Plan")
                    Label("Context Hub", systemImage: "brain.head.profile").tag("Hub")
                    Label("Skills", systemImage: "hammer").tag("Skills")
                }
                .navigationTitle("Prometheus")
                .listStyle(.sidebar)
            }
        } detail: {
            ZStack {
                Color.black.opacity(0.95).ignoresSafeArea()
                
                HStack(spacing: 0) {
                    // Main Console Area
                    VStack(alignment: .leading) {
                        HStack {
                            Button(action: { isSidebarVisible.toggle() }) {
                                Image(systemName: "sidebar.left")
                            }
                            .buttonStyle(.plain)
                            .padding(.leading, 10)
                            
                            Spacer()
                            
                            Button(action: { isRightPanelVisible.toggle() }) {
                                Image(systemName: "sidebar.right")
                            }
                            .buttonStyle(.plain)
                            .padding(.trailing, 10)
                        }
                        .padding(.top, 10)
                        
                        ScrollView {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("[14:32:01] INFO [NetworkManager] Connected to edge server")
                                    .font(.system(.body, design: .monospaced))
                                    .foregroundColor(.cyan)
                                Text("[14:32:02] ERROR [Database] Connection pool exhausted")
                                    .font(.system(.body, design: .monospaced))
                                    .foregroundColor(.pink)
                                Text("[14:35:00] INFO [Agent] Transitioning to native bridge...")
                                    .font(.system(.body, design: .monospaced))
                                    .foregroundColor(.green)
                            }
                        }
                        .padding()
                        
                        Divider().background(Color.gray.opacity(0.3))
                        
                        HStack {
                            Text("> root@prometheus:~$")
                                .font(.system(.body, design: .monospaced))
                                .foregroundColor(.green)
                            TextField("Enter command...", text: .constant(""))
                                .textFieldStyle(.plain)
                        }
                        .padding()
                    }
                    
                    if isRightPanelVisible {
                        Divider().background(Color.gray.opacity(0.3))
                        
                        // Right Panel
                        VStack(alignment: .leading, spacing: 0) {
                            // Top: Project Plan
                            VStack(alignment: .leading) {
                                Text("CURRENT PROJECT")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                                Text("OPERATION AURORA")
                                    .font(.headline)
                                
                                ProgressView(value: 0.85)
                                    .progressViewStyle(.linear)
                                    .tint(.blue)
                                    .padding(.vertical, 5)
                                
                                List {
                                    PlanItem(text: "Phase 1: Infrastructure", status: .success)
                                    PlanItem(text: "Phase 2: Data Ingestion", status: .success)
                                    PlanItem(text: "Phase 3: AI Training", status: .success)
                                    PlanItem(text: "Phase 4: Integration", status: .loading)
                                }
                                .listStyle(.plain)
                                .scrollContentBackground(.hidden)
                            }
                            .padding()
                            
                            Divider().background(Color.gray.opacity(0.3))
                            
                            // Bottom: Thinking Section
                            VStack(alignment: .leading) {
                                HStack {
                                    Image(systemName: "brain.head.profile")
                                        .foregroundColor(.purple)
                                    Text("THINKING")
                                        .font(.caption)
                                        .fontWeight(.bold)
                                        .foregroundColor(.purple)
                                }
                                .padding(.bottom, 5)
                                
                                ScrollView {
                                    Text(thinkingText)
                                        .font(.system(size: 12, design: .monospaced))
                                        .foregroundColor(.gray)
                                        .lineLimit(nil)
                                }
                            }
                            .frame(maxHeight: 200)
                            .padding()
                            .background(Color.purple.opacity(0.05))
                        }
                        .frame(width: 250)
                    }
                }
            }
            .overlay(alignment: .bottomTrailing) {
                // RAM Gauge
                HStack {
                    Text("15GB / 16GB RAM")
                        .font(.system(size: 10, weight: .bold))
                    ProgressView(value: ramUsage)
                        .frame(width: 100)
                        .tint(ramUsage > 0.9 ? .red : .green)
                }
                .padding(10)
                .background(.ultraThinMaterial)
                .cornerRadius(8)
                .padding()
            }
        }
    }
}

enum StepStatus { case success, loading, pending }

struct PlanItem: View {
    let text: String
    let status: StepStatus
    
    var body: some View {
        HStack {
            Image(systemName: status == .success ? "checkmark.seal.fill" : (status == .loading ? "rays" : "circle"))
                .foregroundColor(status == .success ? .green : (status == .loading ? .blue : .gray))
            Text(text)
                .font(.subheadline)
        }
        .padding(.vertical, 2)
    }
}

@main
struct PrometheusApp: App {
    var body: some Scene {
        WindowGroup {
            PrometheusDashboard()
        }
        .windowStyle(.hiddenTitleBar)
    }
}
