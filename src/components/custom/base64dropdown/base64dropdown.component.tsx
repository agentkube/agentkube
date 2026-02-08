import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { FileText, Copy, CheckCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Base64DropdownProps {
  className?: string;
}

const Base64Dropdown: React.FC<Base64DropdownProps> = ({ className }) => {
  const [decodeInput, setDecodeInput] = useState('');
  const [encodeInput, setEncodeInput] = useState('');
  const [decodeOutput, setDecodeOutput] = useState('');
  const [encodeOutput, setEncodeOutput] = useState('');
  const [decodeError, setDecodeError] = useState('');
  const [encodeError, setEncodeError] = useState('');
  const [copiedDecode, setCopiedDecode] = useState(false);
  const [copiedEncode, setCopiedEncode] = useState(false);

  const handleDecode = () => {
    if (!decodeInput.trim()) {
      setDecodeOutput('');
      setDecodeError('');
      return;
    }

    try {
      const decoded = atob(decodeInput.trim());
      setDecodeOutput(decoded);
      setDecodeError('');
    } catch (error) {
      setDecodeError('Invalid Base64 input. Please check your input and try again.');
      setDecodeOutput('');
    }
  };

  const handleEncode = () => {
    if (!encodeInput.trim()) {
      setEncodeOutput('');
      setEncodeError('');
      return;
    }

    try {
      const encoded = btoa(encodeInput);
      setEncodeOutput(encoded);
      setEncodeError('');
    } catch (error) {
      setEncodeError('Unable to encode the input. Please check for invalid characters.');
      setEncodeOutput('');
    }
  };

  const copyToClipboard = async (text: string, type: 'decode' | 'encode') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'decode') {
        setCopiedDecode(true);
        setTimeout(() => setCopiedDecode(false), 2000);
      } else {
        setCopiedEncode(true);
        setTimeout(() => setCopiedEncode(false), 2000);
      }
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className={`h-full w-44 flex justify-between ${className || ''}`}>
          <FileText className="h-4 w-4" />
          Base64
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className="w-96 p-0 dark:bg-card/40 backdrop-blur-xl">
        <div className="p-4">
          <Tabs defaultValue="decode" className="w-full">
            <TabsList className="text-sm grid w-full grid-cols-3 dark:bg-transparent">
              <TabsTrigger value="decode">Decode</TabsTrigger>
              <TabsTrigger value="encode">Encode</TabsTrigger>
            </TabsList>

            <TabsContent value="decode" className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Base64 Input
                </label>
                <Textarea
                  placeholder="Enter Base64 encoded text..."
                  value={decodeInput}
                  onChange={(e) => {
                    setDecodeInput(e.target.value);
                    setDecodeError('');
                    setDecodeOutput('');
                  }}
                  className="min-h-[80px] font-mono text-xs"
                />
                <Button
                  onClick={handleDecode}
                  disabled={!decodeInput.trim()}
                  className="w-full mt-4"
                >
                  Decode
                </Button>
              </div>

              {decodeError && (
                <Alert variant="destructive">
                  <AlertDescription>{decodeError}</AlertDescription>
                </Alert>
              )}

              {decodeOutput && (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-medium">
                      Decoded Output
                    </label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(decodeOutput, 'decode')}
                      className="h-7"
                    >
                      {copiedDecode ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                  <Textarea
                    value={decodeOutput}
                    readOnly
                    className="min-h-[80px] font-mono text-xs bg-transparent dark:bg-transparent "
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent value="encode" className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Text Input
                </label>
                <Textarea
                  placeholder="Enter text to encode..."
                  value={encodeInput}
                  onChange={(e) => {
                    setEncodeInput(e.target.value);
                    setEncodeError('');
                    setEncodeOutput('');
                  }}
                  className="min-h-[80px] font-mono text-xs"
                />
                <Button
                  onClick={handleEncode}
                  disabled={!encodeInput.trim()}
                  className="w-full mt-4"
                >
                  Encode
                </Button>
              </div>

              {encodeError && (
                <Alert variant="destructive">
                  <AlertDescription>{encodeError}</AlertDescription>
                </Alert>
              )}

              {encodeOutput && (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-medium">
                      Base64 Output
                    </label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(encodeOutput, 'encode')}
                      className="h-7"
                    >
                      {copiedEncode ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                  <Textarea
                    value={encodeOutput}
                    readOnly
                    className="min-h-[80px] font-mono text-xs bg-transparent dark:bg-transparent break-all"
                  />
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default Base64Dropdown;