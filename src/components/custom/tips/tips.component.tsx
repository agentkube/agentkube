"use client";
import React, { useState } from "react";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalTrigger,
} from "@/components/ui/animatedmodal";
import { Lightbulb } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { tips } from "@/constants/tips.constants";

const TipsModal: React.FC = () => {
  const [activeIndex, setActiveIndex] = useState<number>(0);

  const handleSkip = (): void => {
    // Find and click the close button
    const closeButton = document.querySelector('.absolute.top-4.right-4.group') as HTMLButtonElement | null;
    closeButton?.click();
  };

  return (
    <Modal shouldAutoOpen={true} featureKey="featured_update_shown">
      <ModalTrigger className="text-blue-600 backdrop-blur-md hover:text-blue-500 cursor-pointer group px-2 hover:bg-gray-100/10">
        <Lightbulb
          onClick={() => setActiveIndex(0)}
          className="h-3 w-3 text-muted-foreground group-hover:text-blue-400 transition-colors"
        />
      </ModalTrigger>
      <ModalBody className="md:max-w-xl">
        <ModalContent>
          <h4 className="text-lg md:text-2xl text-foreground font-bold text-center mb-6">
            <span className="flex items-center justify-center gap-4 text-4xl">
              <Lightbulb className="h-8 w-8 text-yellow-400" />
              <h1 className="font-[Anton] uppercase">Tips & Features</h1>
            </span>
          </h4>

          <div className="w-full mx-auto">
            <Carousel className="w-full"
              opts={{
                loop: true,
                align: "center",
              }}
              setApi={(api) => {
                api?.on("select", () => {
                  setActiveIndex(api.selectedScrollSnap());
                });
              }}
            >
              <CarouselContent>
                {tips.map((tip) => (
                  <CarouselItem key={tip.id}>
                    <div className="p-0">
                      <Card className="border-none shadow-none">
                        <CardContent className="flex flex-col items-center justify-center p-0">
                          <div className={`overflow-hidden bg-gradient-to-br from-secondary to-secondary w-full ${!tip.title && !tip.description ? 'h-full' : 'mb-4'}`}>
                            <img
                              src={tip.imageUrl}
                              alt={tip.title || "Tip image"}
                              className={`w-full object-cover ${!tip.title && !tip.description ? 'h-80' : 'h-64'}`}
                            />
                          </div>
                          <div className="px-8 md:px-10">

                            {tip.title && (
                              <h3 className="text-xl font-medium mb-2 text-center text-foreground">
                                {tip.title}
                              </h3>
                            )}
                            {tip.description && (
                              <p className="text-sm text-center text-muted-foreground">
                                {tip.description}
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <div className="flex justify-between mt-4 px-8 md:px-10">
                <CarouselPrevious className="relative static transform-none bg-secondary border-none hover:bg-accent-hover" />
                <CarouselNext className="relative static transform-none bg-secondary border-none hover:bg-accent-hover" />
              </div>
            </Carousel>

            <div className="flex justify-center gap-1 -mt-4">
              {tips.map((_, index) => (
                <div
                  key={index}
                  className={`h-1.5 rounded-full transition-all duration-300 ${activeIndex === index
                    ? "w-4 bg-blue-500"
                    : "w-1.5 bg-secondary"}
                    }`}
                />
              ))}
            </div>
          </div>
        </ModalContent>
        <ModalFooter className="gap-4 flex items-center">
          <div className="flex-1 text-xs text-muted-foreground">
            {activeIndex + 1} of {tips.length}
          </div>
          <Button
            onClick={handleSkip}
            variant="link"
            className="underline text-muted-foreground hover:text-foreground transition-all text-sm px-4 py-1.5 rounded-md"
          >
            Skip for now
          </Button>
        </ModalFooter>
      </ModalBody>
    </Modal>
  );
};

export default TipsModal;