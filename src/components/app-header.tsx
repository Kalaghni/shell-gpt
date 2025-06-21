import {SidebarTrigger} from "@/components/ui/sidebar.tsx";
import {Separator} from "@radix-ui/react-separator";
import {ThemeToggle} from "@/components/theme-toggle.tsx";
import GradientText from "@/components/ui/gradient-text.tsx";

export default function AppHeader() {

    return (
        <header className="app-header flex h-14 shrink-0 items-center gap-2 pr-[138px] border-b-1">
            <div className="flex flex-1 items-center justify-between gap-2 px-3">
                <div className="flex flex-1 items-center gap-2">
                    <SidebarTrigger/>
                    <Separator
                        orientation="vertical"
                        className="mr-2 data-[orientation=vertical]:h-4"
                    />
                    <div>
                        <GradientText
                            colors={["#40ffaa", "#4079ff", "#40ffaa", "#4079ff", "#40ffaa"]}
                            animationSpeed={3}
                            showBorder={false}
                            className="custom-class"
                        >
                            Shell-GPT
                        </GradientText>
                    </div>
                </div>
                <ThemeToggle/>
            </div>
        </header>
    )
}