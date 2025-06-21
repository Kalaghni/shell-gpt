import {BaseSyntheticEvent, useState} from "react";
import {SettingValues} from "@/types/settings.ts";
import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage} from "@/components/ui/form";
import {useForm} from "react-hook-form";
import {Input} from "@/components/ui/input.tsx";
import {Button} from "@/components/ui/button.tsx";
import {Loader2} from "lucide-react";

export default function Settings() {

    const [saving, setSaving] = useState(false);

    const form = useForm<SettingValues>({
        defaultValues: backend.getSettings
    });

    function saveSettings(settings: SettingValues, event?: BaseSyntheticEvent) {
        if (event) {
            event.preventDefault();
        }
        setSaving(true);
        backend.saveSettings(settings)
            .finally(() => setSaving(false));
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(saveSettings)} className="p-4 space-y-3">
                <FormField
                    control={form.control}
                    name="apiKey"
                    render={({field}) => (
                        <FormItem>
                            <FormLabel>Open AI API Key</FormLabel>
                            <FormControl>
                                <Input
                                    {...field}
                                    type="password"
                                />
                            </FormControl>
                            <FormMessage/>
                        </FormItem>
                    )}
                />
                <div>
                    <Button disabled={saving} type="submit">
                        {saving && (
                           <Loader2 className="animate-spin"/>
                        )} Save
                    </Button>
                </div>
            </form>
        </Form>
    )
}