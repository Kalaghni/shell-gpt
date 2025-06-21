import {Input} from "@/components/ui/input.tsx";
import {useEffect, useRef, useState} from "react";
import {ShellContent} from "@/types/shell.ts";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {
    Check,
    OctagonAlert, OctagonX,
    PlayCircle,
    PlusCircle,
    StopCircle, TriangleAlert
} from "lucide-react";
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert.tsx";
import {Button} from "@/components/ui/button.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu.tsx";
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from "@/components/ui/dialog";

export default function Shell() {

    const [value, setValue] = useState<string>("Create an expressjs server on port 3000 that hosts files, and can have files uploaded.");
    const [messages, setMessages] = useState<ShellContent[]>([]);
    const [currentMessage, setCurrentMessage] = useState<ShellContent|null>(null);
    const partialBuffer = useRef<ShellContent | null>(null);

    const [error, setError]     = useState<string|undefined>();
    const [started, setStarted] = useState<boolean>(false);
    const [requireInput, setRequireInput] = useState<boolean>(false);

    const defaultImages = window.localStorage.getItem("images");


    const [images, setImages] = useState<string[]>(
        [
            ...(defaultImages ? JSON.parse(defaultImages) : [
                'node:24-alpine3.21'
            ]),
        ]
    );

    const [image, setImage] = useState<string>(images[0]);
    const [addImage, setAddImage] = useState<boolean>(false);
    const [newImage, setNewImage] = useState<string>('');

    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const interval = setInterval(() => {
            if (partialBuffer.current) {
                setCurrentMessage(partialBuffer.current);
                partialBuffer.current = null;
            }
        }, 60); // 60ms for "smooth" feel, adjust as needed

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        backend.onShell((content) => {

            if (content.event === 'partial') {
                partialBuffer.current = content;
            }
            else {
                setCurrentMessage(null);
                setMessages(prev => prev.concat([content]));
            }
        })

        return () => {
            backend.offShell()
        }
    }, []);

    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, currentMessage]);

    useEffect(() => {
        window.localStorage.setItem("images", JSON.stringify(images));
    }, [images]);

    async function runCommand(value: string) {

        setValue("");
        setMessages(messages.concat([{
            message: value,
            who: "user",
            event: "done",
            status: "OK"
        }]));

        setRequireInput(false);
        if (!started) {
            setStarted(true);

            backend.start(value, image)
                .then((err) => {
                    if (err) {
                        setError(err.message);
                    }
                })
                .finally(() => setRequireInput(true));

        }
        else {
            backend.send(value)
                .then((err) => {
                    if (err) {
                        setError(err.message);
                    }
                })
                .finally(() => setRequireInput(true));
        }
    }

    return (
        <>
            <Dialog open={addImage} onOpenChange={(open) => setAddImage(open)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Image</DialogTitle>
                    </DialogHeader>
                    <Input
                        placeholder="Image Name/Checksum"
                        value={newImage}
                        onChange={(e) => setNewImage(e.target.value)}
                    />
                    <DialogFooter>
                        <Button onClick={() => {
                            setNewImage("");
                            setImages([
                                ...images,
                                newImage
                            ]);
                            setAddImage(false);
                            setImage(newImage);
                        }}>Add</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <div className="contain-content" style={{height: 'calc(100vh - 56px)'}}>
                <div className="flex flex-col w-full bg-background overflow-y-auto p-4 gap-3" style={{
                    height: "calc(100% - 56px)",
                }}>
                    {messages.concat(currentMessage ? [currentMessage] : []).map((message) => (
                        <div className={`flex justify-${message.who === 'user' ? 'end' : 'start'}`}>
                            <Card className="min-w-2/3 w-fit">
                                <CardHeader>
                                    <CardTitle className="flex flex-row gap-4">
                                        {message.who}
                                        {message.status === "OK" ?
                                            <Check/>
                                        : message.status === "ERR" ?
                                            <OctagonAlert/>
                                        : message.status === "TERM" ?
                                            <OctagonX/>
                                        :  message.status === "WARN" ?
                                            <TriangleAlert/>
                                        : ""}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="whitespace-pre text-wrap overflow-x-auto">
                                    {message.message}
                                </CardContent>
                            </Card>
                        </div>
                    ))}
                    {error && (
                        <Alert variant="destructive" className='justify-self-end'>
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    <div ref={scrollRef} />
                </div>
                <div className="p-3 fixed left-0 right-0 bottom-0">
                    <div className="flex w-full items-center gap-2">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="secondary">{image}</Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                {images.map((image, i) => (
                                    <DropdownMenuItem onClick={() => setImage(image)} key={i}>
                                        {image}
                                    </DropdownMenuItem>
                                ))}
                                <DropdownMenuItem onClick={() => setAddImage(true)}>
                                    + Add Image
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Input
                            autoFocus={true}
                            className="w-full"
                            placeholder="Enter a task"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    runCommand(value);
                                }
                            }}
                        />
                        <Button
                            variant="ghost"
                            onClick={() => {
                                if ((!started || requireInput)) {
                                    runCommand(value)
                                }
                                else {
                                    if (value.length) {
                                        runCommand(value);
                                    }
                                    else {
                                        backend.stop();
                                    }
                                }
                            }}
                        >
                            {(!started || requireInput) ?
                                <PlayCircle/>
                            :
                                value.length > 0 ? <PlusCircle/> : <StopCircle/>
                            }
                        </Button>
                    </div>
                </div>
            </div>
        </>
    )
}