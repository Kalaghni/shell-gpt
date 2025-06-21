import './app.css'
import {AppSidebar} from "@/components/app-sidebar.tsx";
import {SidebarInset, SidebarProvider} from "@/components/ui/sidebar.tsx";
import AppHeader from "@/components/app-header.tsx";
import Shell from "@/frontend/pages/Shell.tsx";
import {ThemeProvider} from "@/components/theme-provider.tsx";
import {Route, Routes} from "react-router-dom";
import Settings from "@/frontend/pages/Settings.tsx";

function App() {
    return (
        <ThemeProvider>
            <SidebarProvider defaultOpen={false}>
                <AppSidebar/>
                <SidebarInset>
                    <AppHeader/>
                    <Routes>
                        <Route path="/" element={<Shell/>} />
                        <Route path="/settings" element={<Settings/> }/>
                    </Routes>
                </SidebarInset>
            </SidebarProvider>
        </ThemeProvider>
    )
}

export default App
